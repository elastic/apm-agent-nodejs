'use strict'
const constants = require('../../../constants')
const TYPE = 'db'
const SUBTYPE = 'dynamodb'
const ACTION = 'query'

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

function shouldIgnoreRequest (request, agent) {
  return false
}

// Main entrypoint for SQS instrumentation
//
// Must call (or one of its function calls must call) the
// `orig` function/method
function instrumentationDynamoDb (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (shouldIgnoreRequest(request, agent)) {
    return orig.apply(request, origArguments)
  }

  const type = TYPE
  const subtype = SUBTYPE
  const action = ACTION

  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(name, type, subtype, action)
  if (!span) {
    return orig.apply(request, origArguments)
  }

  span.setDbContext({
    instance: getRegionFromRequest(request),
    statement: getStatementFromRequest(request),
    type: SUBTYPE
  })
  span.setDestinationContext({
    address: getAddressFromRequest(request),
    port: getPortFromRequest(request),
    service: {
      name: SUBTYPE,
      type: 'db',
      resource: SUBTYPE
    },
    cloud: {
      region: getRegionFromRequest(request)
    }
  })

  request.on('complete', function (response) {
    if (response && response.error) {
      const errOpts = {
        skipOutcome: true
      }
      agent.captureError(response.error, errOpts)
      span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
    }

    // Workaround a bug in the agent's handling of `span.sync`.
    //
    // The bug: Currently this span.sync is not set `false` because there is
    // an HTTP span created (for this S3 request) in the same async op. That
    // HTTP span becomes the "active span" for this async op, and *it* gets
    // marked as sync=false in `before()` in async-hooks.js.
    span.sync = false
    span.end()
  })

  return orig.apply(request, origArguments)
}

module.exports = {
  instrumentationDynamoDb,

  // exported for testing
  getRegionFromRequest,
  getPortFromRequest,
  getStatementFromRequest,
  getAddressFromRequest,
  getMethodFromRequest
}
