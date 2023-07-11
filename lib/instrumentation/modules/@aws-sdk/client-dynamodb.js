/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const constants = require('../../../constants')
const NAME = 'DynamoDB'
const TYPE = 'db'
const SUBTYPE = 'dynamodb'
const elasticAPMStash = Symbol('elasticAPMStash')

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
 * @param {any} agent
 * @returns {import('./smithy-client').AWSMiddlewareEntry[]}
 */
function dynamoDBMiddlewareFactory (client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        // Ensure there is a span from the wrapped `client.send()`.
        const span = agent._instrumentation.currSpan()
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args)
        }

        console.log({ context })
        console.log({ args })
        const input = args.input

        // TODO: review spec and add OTel attributes
        // https://github.com/open-telemetry/opentelemetry-specification/blob/v1.20.0/semantic_conventions/trace/instrumentation/aws-sdk.yml#L435

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


          // TODO: something related to region?
          const config = client.config
          const region = await config.region()

          // Set the db context
          const dbContext = { type: SUBTYPE } // dynamodb
          if (region) {
            dbContext.instance = region
          }
          span.setDbContext(dbContext)

          // Set destination context
          const destContext = {}
          if (context[elasticAPMStash]) {
            destContext.address = context[elasticAPMStash].hostname
            destContext.port = context[elasticAPMStash].port
          }
          if (region) {
            destContext.service = { resource: `dynamodb/${region}` }
            destContext.cloud = { region }
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

        console.log({ req })

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

function getRegionFromRequest (request) {
  return request && request.service &&
        request.service.config && request.service.config.region
}

function getPortFromRequest (request) {
  return request && request.service &&
        request.service.endpoint && request.service.endpoint.port
}

function getMethodFromRequest (request) {
  const method = request && request.operation
  if (method) {
    return method[0].toUpperCase() + method.slice(1)
  }
}

function getStatementFromRequest (request) {
  const method = getMethodFromRequest(request)
  if (method === 'Query' && request && request.params && request.params.KeyConditionExpression) {
    return request.params.KeyConditionExpression
  }
  return undefined
}

function getAddressFromRequest (request) {
  return request && request.service && request.service.endpoint &&
        request.service.endpoint.hostname
}

function getTableFromRequest (request) {
  const table = request && request.params && request.params.TableName
  if (!table) {
    return ''
  }
  return ` ${table}`
}

// Creates the span name from request information
function getSpanNameFromRequest (request) {
  const method = getMethodFromRequest(request)
  const table = getTableFromRequest(request)
  const name = `DynamoDB ${method}${table}`
  return name
}

module.exports = {
  DYNAMODB_NAME: NAME,
  DYNAMODB_TYPE: TYPE,
  DYNAMODB_SUBTYPE: SUBTYPE,
  dynamoDBMiddlewareFactory
}
