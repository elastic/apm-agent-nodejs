/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const { MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT, OUTCOME_FAILURE } = require('../../../constants')
const { getHttpInfo, httpInfoMiddleware } = require('./http-info-middleware')
const NAME = 'SQS'
const TYPE = 'messaging'
const SUBTYPE = 'sqs'

// TODO: simthy-client already resolves span.action from the command name but does not have these values
// DeleteMessageCommand => span.action = 'DeleteMessage'
// do we need to have same messages (keep this key/val pairs) or its okay to have the ones form smithy-client?
const OPERATIONS_TO_ACTIONS = {
  DeleteMessage: 'delete',
  DeleteMessageBatch: 'delete_batch',
  ReceiveMessage: 'poll',
  SendMessageBatch: 'send_batch',
  SendMessage: 'send',
  unknown: 'unknown'
}
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS)
const MAX_SQS_MESSAGE_ATTRIBUTES = 10

// Parses queue/topic name from AWS queue URL
function getQueueNameFromCommand (command) {
  const queueUrl = command && command.input && command.input.QueueUrl

  if (queueUrl) {
    try {
      const url = new URL(queueUrl)
      return url.pathname.split('/').pop()
    } catch {}
  }

  return 'unknown'
}

// Extract span links from up to 1000 messages in this batch.
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
//
// A span link is created from a `traceparent` message attribute in a message.
// `msg.messageAttributes` is of the form:
//    { <attribute-name>: { DataType: <attr-type>, StringValue: <attr-value>, ... } }
// For example:
//    { traceparent: { DataType: 'String', StringValue: 'test-traceparent' } }
function getSpanLinksFromResponseData (data) {
  if (!data || !data.Messages || data.Messages.length === 0) {
    return null
  }
  const links = []
  const limit = Math.min(data.Messages.length, MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT)
  for (let i = 0; i < limit; i++) {
    const attrs = data.Messages[i].MessageAttributes
    if (!attrs) {
      continue
    }

    let traceparent
    const attrNames = Object.keys(attrs)
    for (let j = 0; j < attrNames.length; j++) {
      const attrVal = attrs[attrNames[j]]
      if (attrVal.DataType !== 'String') {
        continue
      }
      const attrNameLc = attrNames[j].toLowerCase()
      if (attrNameLc === 'traceparent') {
        traceparent = attrVal.StringValue
        break
      }
    }
    if (traceparent) {
      links.push({ context: traceparent })
    }
  }
  return links
}

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-sqs').SQSClient} client
 * @param {any} agent
 * @returns {import('./smithy-client').AWSMiddlewareEntry[]}
 */
function sqsMiddlewareFactory (client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        const ins = agent._instrumentation
        const log = agent.logger
        const span = ins.currSpan()
        const input = args.input

        // W3C trace-context propagation.
        const runContext = ins.currRunContext()
        const parentSpan = span || runContext.currSpan() || runContext.currTransaction()
        const targetId = input && (input.TopicArn || input.TargetArn || input.PhoneNumber)

        // Though our spec only mentions a 10-message-attribute limit for *SQS*, we'll
        // do the same limit here, because
        // https://docs.aws.amazon.com/sns/latest/dg/sns-message-attributes.html
        // mentions the 10-message-attribute limit for SQS subscriptions.
        input.MessageAttributes = input.MessageAttributes || {}
        if (input.MessageAttributes && Object.keys(input.MessageAttributes).length + 2 > MAX_SQS_MESSAGE_ATTRIBUTES) {
          log.warn('cannot propagate trace-context with SQS message to %s, too many MessageAttributes', targetId)
        } else {
          parentSpan.propagateTraceContextHeaders(input.MessageAttributes, function (msgAttrs, name, value) {
            if (name.startsWith('elastic-')) {
              return
            }
            msgAttrs[name] = { DataType: 'String', StringValue: value }
          })
        }

        // Ensure there is a span from the wrapped `client.send()`.
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args)
        }

        const queueName = getQueueNameFromCommand(args)
        let toFrom = ' from '
        if (span.action === 'SendMessage' || span.action === 'SendMessageBatch') {
          toFrom = ' to '
        }
        span.name += toFrom + queueName

        let err
        let result
        let response
        let statusCode
        try {
          result = await next(args)
          response = result && result.response
          statusCode = response && response.statusCode
        } catch (ex) {
          // Save the error for use in `finally` below, but re-throw it to
          // not impact code flow.
          err = ex

          // This code path happens with a GetObject conditional request
          // that returns a 304 Not Modified.
          statusCode = err && err.$metadata && err.$metadata.httpStatusCode
          throw ex
        } finally {
          if (statusCode) {
            span._setOutcomeFromHttpStatusCode(statusCode)
          } else {
            span._setOutcomeFromErrorCapture(OUTCOME_FAILURE)
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true })
          }

          // Destination context.
          const region = await client.config.region()
          const service = { name: SUBTYPE, type: TYPE }
          const destCtx = Object.assign({ service }, getHttpInfo(context))

          if (region) {
            destCtx.cloud = { region }
          }
          span._setDestinationContext(destCtx)

          // Message context
          span.setMessageContext({ queue: { name: queueName } })

          // Links
          const receiveMsgData = span.action === 'ReceiveMessage' && result
          if (receiveMsgData) {
            const links = getSpanLinksFromResponseData(receiveMsgData)
            if (links) {
              span._addLinks(links)
            }
          }

          span.end()
        }

        return result
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' }
    },
    {
      middleware: httpInfoMiddleware,
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' }
    }
  ]
}

/**
 * Tells if the command needs to be ignored or not
 * @param {import('@aws-sdk/types').Command} command the command sent by the SNS client
 * @param {any} config the agent configuration
 * @returns {boolean} false if the command should create a span
 */
function sqsShouldIgnoreCommand (command, config) {
  const commandName = command.constructor.name
  const operation = commandName.replace(/Command$/, '')

  if (OPERATIONS.indexOf(operation) === -1) {
    return true
  }

  if (config.ignoreMessageQueuesRegExp) {
    const queueName = getQueueNameFromCommand(command)
    if (queueName) {
      for (const rule of config.ignoreMessageQueuesRegExp) {
        if (rule.test(queueName)) {
          return true
        }
      }
    }
  }

  return false
}

module.exports = {
  SNS_NAME: NAME,
  SNS_TYPE: TYPE,
  SNS_SUBTYPE: SUBTYPE,
  sqsMiddlewareFactory,
  sqsShouldIgnoreCommand
}
