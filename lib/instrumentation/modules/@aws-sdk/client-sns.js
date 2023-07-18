/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const constants = require('../../../constants')
const NAME = 'SNS'
const TYPE = 'messaging'
const SUBTYPE = 'sns'
const elasticAPMStash = Symbol('elasticAPMStash')
const MAX_SNS_MESSAGE_ATTRIBUTES = 10

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-s3').SNSClient} client
 * @param {any} agent
 * @returns {import('./smithy-client').AWSMiddlewareEntry[]}
 */
function snsMiddlewareFactory (client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        const ins = agent._instrumentation
        const log = agent.logger
        const span = ins.currSpan()
        const input = args.input

        // TODO: trace-context propagation goes here
        const runContext = ins.currRunContext()
        const parentSpan = span || runContext.currSpan() || runContext.currTransaction()
        const targetId = input && (input.TopicArn || input.TargetArn || input.PhoneNumber)

        // Though our spec only mentions a 10-message-attribute limit for *SQS*, we'll
        // do the same limit here, because
        // https://docs.aws.amazon.com/sns/latest/dg/sns-message-attributes.html
        // mentions the 10-message-attribute limit for SQS subscriptions.
        input.MessageAttributes = input.MessageAttributes || {}
        if (input.MessageAttributes && Object.keys(input.MessageAttributes).length + 2 > MAX_SNS_MESSAGE_ATTRIBUTES) {
          log.warn('cannot propagate trace-context with SNS message to %s, too many MessageAttributes', targetId)
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

        if (targetId) {
          span.name += ' to ' + targetId
        }

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
            span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true })
          }

          // TODO: set context in the span
          // const region = await config.region()

          // Destination context.
          // TODO: review this
          const destContext = {
            service: {
              name: SUBTYPE,
              type: TYPE
            }
          }
          if (context[elasticAPMStash]) {
            destContext.address = context[elasticAPMStash].hostname
            destContext.port = context[elasticAPMStash].port
          }
          span._setDestinationContext(destContext)

          span.end()
        }

        return result
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' }
    },
    {
      middleware: (next, context) => async (args) => {
        const req = args.request
        let port = req.port

        // Resolve port for HTTP(S) protocols
        if (port === undefined) {
          if (req.protocol === 'https:') {
            port = 443
          } else if (req.protocol === 'http:') {
            port = 80
          }
        }

        context[elasticAPMStash] = {
          hostname: req.hostname,
          port
        }
        return next(args)
      },
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' }
    }
  ]
}

/**
 * Tells if the command needs to be instrumented or not
 * @param {any} command the command sent by the SNS client
 * @returns {boolean}
 */
function snsCommandFilter (command) {
  return command.constructor.name === 'PublishCommand'
}

module.exports = {
  SNS_NAME: NAME,
  SNS_TYPE: TYPE,
  SNS_SUBTYPE: SUBTYPE,
  snsMiddlewareFactory,
  snsCommandFilter
}
