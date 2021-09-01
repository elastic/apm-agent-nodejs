const constants = require('../../../constants')

const TYPE = 'messaging'
const SUBTYPE = 'sns'
const ACTION = 'publish'
const PHONE_NUMBER = '<PHONE_NUMBER>'

function getArnOrPhoneNumberFromRequest (request) {
  let arn = request && request.params && request.params.TopicArn
  if (!arn) {
    arn = request && request.params && request.params.TargetArn
  }
  if (!arn) {
    arn = request && request.params && request.params.PhoneNumber
  }
  return arn
}

function getRegionFromRequest (request) {
  return request && request.service &&
        request.service.config && request.service.config.region
}

function getSpanNameFromRequest (request) {
  const topicName = getDestinationNameFromRequest(request)
  return `SNS PUBLISH to ${topicName}`
}

function getMessageContextFromRequest (request) {
  return {
    queue: {
      name: getDestinationNameFromRequest(request)
    }
  }
}

function getAddressFromRequest (request) {
  return request && request.service && request.service.endpoint &&
    request.service.endpoint.hostname
}

function getPortFromRequest (request) {
  return request && request.service && request.service.endpoint &&
    request.service.endpoint.port
}

function getMessageDestinationContextFromRequest (request) {
  return {
    address: getAddressFromRequest(request),
    port: getPortFromRequest(request),
    service: {
      resource: `${SUBTYPE}/${getDestinationNameFromRequest(request)}`,
      type: TYPE,
      name: SUBTYPE
    },
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

  const topicArn = request && request.params && request.params.TopicArn
  const targetArn = request && request.params && request.params.TargetArn

  if (topicArn) {
    const parts = topicArn.split(':')
    const topicName = parts.pop()
    return topicName
  }

  if (targetArn) {
    const fullName = targetArn.split(':').pop()
    if (fullName.lastIndexOf('/') !== -1) {
      return fullName.substring(0, fullName.lastIndexOf('/'))
    } else {
      return fullName
    }
  }
}

function shouldIgnoreRequest (request, agent) {
  if (request.operation !== 'publish') {
    return true
  }

  // is the named topic on our ignore list?
  if (agent._conf && agent._conf.ignoreMessageQueuesRegExp) {
    const queueName = getArnOrPhoneNumberFromRequest(request)
    if (queueName) {
      for (const rule of agent._conf.ignoreMessageQueuesRegExp) {
        if (rule.test(queueName)) {
          return true
        }
      }
    }
  }

  return false
}

function instrumentationSns (orig, origArguments, request, AWS, agent, { version, enabled }) {
  const type = TYPE
  const subtype = SUBTYPE
  const action = ACTION

  if (shouldIgnoreRequest(request, agent)) {
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
  getMessageDestinationContextFromRequest,
  getArnOrPhoneNumberFromRequest
}
