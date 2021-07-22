const constants = require('../../../constants')

const TYPE = 'messaging'
const SUBTYPE = 'sns'
const ACTION = 'send'
const ACCESS_POINT = 'accesspoint'
const PHONE_NUMBER = '<PHONE_NUMBER>'

function getRegionFromRequest (request) {
  return request && request.service &&
        request.service.config && request.service.config.region
}

function getSpanNameFromRequest (request) {
  const topicName = getDestinationNameFromRequest(request)
  return `SNS PUBLISH ${topicName}`
}

function getMessageContextFromRequest (request) {
  return {
    queue_name: getDestinationNameFromRequest(request)
  }
}

function getMessageDestinationContextFromRequest (request) {
  return {
    resource: `${SUBTYPE}/${getDestinationNameFromRequest(request)}`,
    type: TYPE,
    name: SUBTYPE,
    cloud: {
      region: getRegionFromRequest(request)
    }
  }
}

function getDestinationNameFromRequest (request) {
  const phoneNumber = request && request.params && request.params.PhoneNumber
  if (phoneNumber) {
    return PHONE_NUMBER
  }

  let arn = request && request.params && request.params.TopicArn
  if (!arn) {
    arn = request && request.params && request.params.TargetArn
  }

  if (!arn) {
    return
  }
  const parts = arn.split(':')
  const topicOrAccessPointName = parts.pop()
  const maybeAccessPoint = parts.pop()
  if (ACCESS_POINT === maybeAccessPoint) {
    return `${ACCESS_POINT}:${topicOrAccessPointName}`
  }
  return topicOrAccessPointName
}

function instrumentationSns (orig, origArguments, request, AWS, agent, { version, enabled }) {
  const type = TYPE
  const subtype = SUBTYPE
  const action = ACTION
  const operation = request.operation
  if (operation !== 'publish') {
    return orig.apply(request, origArguments)
  }

  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(name, type, subtype, action)
  if (!span) {
    return orig.apply(request, origArguments)
  }

  span.setDestinationContext(getMessageDestinationContextFromRequest(request))
  span.setMessageContext(getMessageContextFromRequest(request))

  request.on('complete', function (response) {
    if (response && response.error) {
      const errOpts = {
        skipOutcome: true
      }
      agent.captureError(response.error, errOpts)
      span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
    }

    // we'll need to manually mark this span as async.  The actual async hop
    // is captured by the agent's async hooks instrumentation
    span.sync = false
    span.end()
  })

  return orig.apply(request, origArguments)
}

module.exports = {
  instrumentationSns,

  // exported for testing
  getSpanNameFromRequest,
  getDestinationNameFromRequest,
  getMessageDestinationContextFromRequest
}
