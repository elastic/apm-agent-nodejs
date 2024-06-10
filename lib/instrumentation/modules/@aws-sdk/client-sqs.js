/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const {
  MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
  OUTCOME_FAILURE,
} = require('../../../constants');
const NAME = 'SQS';
const TYPE = 'messaging';
const SUBTYPE = 'sqs';
const elasticAPMStash = Symbol('elasticAPMStash');

// TODO: simthy-client already resolves span.action from the command name but does not have these values
// DeleteMessageCommand => span.action = 'DeleteMessage'
// do we need to have same messages (keep this key/val pairs) or its okay to have the ones form smithy-client?
const OPERATIONS_TO_ACTIONS = {
  DeleteMessage: 'delete',
  DeleteMessageBatch: 'delete_batch',
  ReceiveMessage: 'poll',
  SendMessageBatch: 'send_batch',
  SendMessage: 'send',
  unknown: 'unknown',
};
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS);
const MAX_SQS_MESSAGE_ATTRIBUTES = 10;
const queueMetrics = new Map();

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-sqs').SQSClient} client
 * @param {any} agent
 * @returns {import('../@smithy/smithy-client').AWSMiddlewareEntry[]}
 */
function sqsMiddlewareFactory(client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        const ins = agent._instrumentation;
        const log = agent.logger;
        const span = ins.currSpan();
        const input = args.input;

        // W3C trace-context propagation.
        const commandName = context.commandName.replace('Command', '');
        const runContext = ins.currRunContext();
        const parentSpan =
          span || runContext.currSpan() || runContext.currTransaction();

        if (parentSpan) {
          const toPropagate = [];

          if (commandName === 'SendMessage' && input.MessageAttributes) {
            toPropagate.push(input.MessageAttributes);
          } else if (
            commandName === 'SendMessageBatch' &&
            Array.isArray(input.Entries)
          ) {
            for (const e of input.Entries) {
              if (e && e.MessageAttributes) {
                toPropagate.push(e.MessageAttributes);
              }
            }
          }

          // Though our spec only mentions a 10-message-attribute limit for *SQS*, we'll
          // do the same limit here, because
          // https://docs.aws.amazon.com/sns/latest/dg/sns-message-attributes.html
          // mentions the 10-message-attribute limit for SQS subscriptions.
          toPropagate.forEach((msgAttrs) => {
            const attrsCount = Object.keys(msgAttrs).length + 2;
            if (attrsCount > MAX_SQS_MESSAGE_ATTRIBUTES) {
              log.warn(
                { QueueUrl: input.QueueUrl },
                'cannot propagate trace-context with SQS message, too many MessageAttributes',
              );
              return;
            }
            parentSpan.propagateTraceContextHeaders(
              msgAttrs,
              function (msgAttrs, name, value) {
                if (name.startsWith('elastic-')) {
                  return;
                }
                msgAttrs[name] = { DataType: 'String', StringValue: value };
              },
            );
          });
        }

        // Ensure there is a span from the wrapped `client.send()`.
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args);
        }

        // Action is not equal to command/operation name, we have to map it
        span.action = OPERATIONS_TO_ACTIONS[commandName] || 'unknown';

        const queueName = getQueueNameFromCommand(args);
        let toFrom = 'from';
        if (span.action === 'send' || span.action === 'send_batch') {
          toFrom = 'to';
        }
        span.name = `SQS ${span.action.toUpperCase()} ${toFrom} ${queueName}`;

        let err;
        let result;
        let response;
        let statusCode;
        try {
          result = await next(args);
          response = result && result.response;
          statusCode = response && response.statusCode;
        } catch (ex) {
          // Save the error for use in `finally` below, but re-throw it to
          // not impact code flow.
          err = ex;

          // This code path happens with a GetObject conditional request
          // that returns a 304 Not Modified.
          statusCode = err && err.$metadata && err.$metadata.httpStatusCode;
          throw ex;
        } finally {
          if (statusCode) {
            span._setOutcomeFromHttpStatusCode(statusCode);
          } else {
            span._setOutcomeFromErrorCapture(OUTCOME_FAILURE);
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true });
          }

          // Destination context.
          const region = await client.config.region();
          const service = { type: SUBTYPE };
          const destCtx = { service };

          if (context[elasticAPMStash]) {
            destCtx.address = context[elasticAPMStash].hostname;
            destCtx.port = context[elasticAPMStash].port;
          }

          if (region) {
            destCtx.cloud = { region };
          }

          span._setDestinationContext(destCtx);

          // Message context
          span.setMessageContext({ queue: { name: queueName } });

          const receiveMsgData =
            span.action === 'poll' && result && result.output;
          if (receiveMsgData) {
            // Links
            const links = getSpanLinksFromResponseData(result && result.output);
            if (links) {
              span.addLinks(links);
            }

            // Metrics
            recordMetrics(queueName, receiveMsgData, agent);
          }

          span.end();
        }

        return result;
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' },
    },
    {
      middleware: (next, context) => async (args) => {
        const req = args.request;
        let port = req.port;

        // Resolve port for HTTP(S) protocols
        if (port === undefined) {
          if (req.protocol === 'https:') {
            port = 443;
          } else if (req.protocol === 'http:') {
            port = 80;
          }
        }

        context[elasticAPMStash] = {
          hostname: req.hostname,
          port,
        };
        return next(args);
      },
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' },
    },
  ];
}

/**
 * Get the queue name from a command
 * @param {import('@aws-sdk/types').Command} command the command sent by the SQS client
 * @returns {string} the queue name
 */
function getQueueNameFromCommand(command) {
  const queueUrl = command && command.input && command.input.QueueUrl;

  if (queueUrl) {
    try {
      const url = new URL(queueUrl);
      return url.pathname.split('/').pop();
    } catch {}
  }

  return 'unknown';
}

/**
 * @typedef {import('@aws-sdk/client-sqs').Message} Message
 */
/**
 * Extract span links from up to 1000 messages in this batch.
 * https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
 *
 * A span link is created from a `traceparent` message attribute in a message.
 * `msg.messageAttributes` is of the form:
 *    { <attribute-name>: { DataType: <attr-type>, StringValue: <attr-value>, ... } }
 * For example:
 *    { traceparent: { DataType: 'String', StringValue: 'test-traceparent' } }
 *
 * @param { {Messages?: Message[]} } data
 * @returns { Array<{ context: string }> }
 */
function getSpanLinksFromResponseData(data) {
  if (!data || !data.Messages || data.Messages.length === 0) {
    return null;
  }
  const links = [];
  const limit = Math.min(
    data.Messages.length,
    MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
  );
  for (let i = 0; i < limit; i++) {
    const attrs = data.Messages[i].MessageAttributes;
    if (!attrs) {
      continue;
    }

    let traceparent;
    const attrNames = Object.keys(attrs);
    for (let j = 0; j < attrNames.length; j++) {
      const attrVal = attrs[attrNames[j]];
      if (attrVal.DataType !== 'String') {
        continue;
      }
      const attrNameLc = attrNames[j].toLowerCase();
      if (attrNameLc === 'traceparent') {
        traceparent = attrVal.StringValue;
        break;
      }
    }
    if (traceparent) {
      links.push({ context: traceparent });
    }
  }
  return links;
}

/**
 * Record queue related metrics
 *
 * Creates metric collector objects on first run, and
 * updates their data with data from received messages
 * @param {string} queueName
 * @param { {Messages?: Message[]} } data
 * @param {any} agent
 */
function recordMetrics(queueName, data, agent) {
  const messages = data && data.Messages;
  if (!messages || messages.length < 1) {
    return;
  }
  if (!queueMetrics.get(queueName)) {
    const collector = agent._metrics.createQueueMetricsCollector(queueName);
    if (!collector) {
      return;
    }
    queueMetrics.set(queueName, collector);
  }
  const metrics = queueMetrics.get(queueName);

  for (const message of messages) {
    const sentTimestamp =
      message.Attributes && message.Attributes.SentTimestamp;
    const delay = new Date().getTime() - sentTimestamp;
    metrics.updateStats(delay);
  }
}

/**
 * Tells if the command needs to be ignored or not
 * @param {import('@aws-sdk/types').Command} command the command sent by the SNS client
 * @param {any} config the agent configuration
 * @returns {boolean} false if the command should create a span
 */
function sqsShouldIgnoreCommand(command, config) {
  const commandName = command.constructor.name;
  const operation = commandName.replace(/Command$/, '');

  if (OPERATIONS.indexOf(operation) === -1) {
    return true;
  }

  if (config.ignoreMessageQueuesRegExp) {
    const queueName = getQueueNameFromCommand(command);
    if (queueName) {
      for (const rule of config.ignoreMessageQueuesRegExp) {
        if (rule.test(queueName)) {
          return true;
        }
      }
    }
  }

  return false;
}

module.exports = {
  SQS_NAME: NAME,
  SQS_TYPE: TYPE,
  SQS_SUBTYPE: SUBTYPE,
  sqsMiddlewareFactory,
  sqsShouldIgnoreCommand,
};
