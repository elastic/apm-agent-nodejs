/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('../../../constants');
const NAME = 'SNS';
const TYPE = 'messaging';
const SUBTYPE = 'sns';
const MAX_SNS_MESSAGE_ATTRIBUTES = 10;
const elasticAPMStash = Symbol('elasticAPMStash');

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-sns').SNSClient} client
 * @param {any} agent
 * @returns {import('./smithy-client').AWSMiddlewareEntry[]}
 */
function snsMiddlewareFactory(client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        const ins = agent._instrumentation;
        const log = agent.logger;
        const span = ins.currSpan();
        const input = args.input;

        // W3C trace-context propagation.
        const runContext = ins.currRunContext();
        const parentSpan =
          span || runContext.currSpan() || runContext.currTransaction();
        const targetId =
          input && (input.TopicArn || input.TargetArn || input.PhoneNumber);

        // Though our spec only mentions a 10-message-attribute limit for *SQS*, we'll
        // do the same limit here, because
        // https://docs.aws.amazon.com/sns/latest/dg/sns-message-attributes.html
        // mentions the 10-message-attribute limit for SQS subscriptions.
        input.MessageAttributes = input.MessageAttributes || {};
        const attributesCount = Object.keys(input.MessageAttributes).length;

        if (attributesCount + 2 > MAX_SNS_MESSAGE_ATTRIBUTES) {
          log.warn(
            'cannot propagate trace-context with SNS message to %s, too many MessageAttributes',
            targetId,
          );
        } else {
          parentSpan.propagateTraceContextHeaders(
            input.MessageAttributes,
            function (msgAttrs, name, value) {
              if (name.startsWith('elastic-')) {
                return;
              }
              msgAttrs[name] = { DataType: 'String', StringValue: value };
            },
          );
        }

        // Ensure there is a span from the wrapped `client.send()`.
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args);
        }

        const destTargets = [
          input.TopicArn && input.TopicArn.split(':').pop(),
          input.TargetArn && input.TargetArn.split(':').pop().split('/').pop(),
          input.PhoneNumber && '<PHONE_NUMBER>',
        ];
        const topicName = destTargets.filter((a) => a).join(', ');

        if (topicName) {
          span.name += ' to ' + topicName;
        }

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

          // This code path happens with a Publish command that returns a 404 Not Found.
          statusCode = err && err.$metadata && err.$metadata.httpStatusCode;
          throw ex;
        } finally {
          if (statusCode) {
            span._setOutcomeFromHttpStatusCode(statusCode);
          } else {
            span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE);
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true });
          }

          // Destination context.
          const region = await client.config.region();
          const service = { name: SUBTYPE, type: TYPE };
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
          if (topicName) {
            span.setMessageContext({ queue: { name: topicName } });
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
 * Tells if the command needs to be ingored
 * @param {import('@aws-sdk/types').Command} command the command sent by the SNS client
 * @param {any} config the agent configuration
 * @returns {boolean} false if the command should create a span
 */
function snsShouldIgnoreCommand(command, config) {
  if (command.constructor.name !== 'PublishCommand') {
    return true;
  }

  if (config.ignoreMessageQueuesRegExp) {
    const input = command.input;
    // It's unlikely but input can have multiple targets defined
    // and having a priority list between them may result in
    // not honoring `ignoreMessageQueues` config.
    const topicNames = input
      ? [input.TopicArn, input.TargetArn, input.PhoneNumber].filter((t) => t)
      : [];

    for (const topicName of topicNames) {
      for (const rule of config.ignoreMessageQueuesRegExp) {
        if (rule.test(topicName)) {
          return true;
        }
      }
    }
  }

  return false;
}

module.exports = {
  SNS_NAME: NAME,
  SNS_TYPE: TYPE,
  SNS_SUBTYPE: SUBTYPE,
  snsMiddlewareFactory,
  snsShouldIgnoreCommand,
};
