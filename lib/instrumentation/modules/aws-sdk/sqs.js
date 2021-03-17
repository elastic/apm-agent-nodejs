'use strict'

const OPERATIONS_TO_ACTIONS = {
  "deleteMessage"       : "delete",
  "deleteMessageBatch"  : "delete_batch",
  "receiveMessage"      : "receive",
  "sendMessageBatch"    : "send_batch",
  "sendMessage"         : "send",
  "unknown"             : "unknown"
}
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS)
const TYPE = 'messaging'

/**
 * Returns Message Queue action from AWS SDK method name
 */
function getActionFromRequest(request) {
  request = request ? request : {}
  const operation = request.operation ? request.operation : 'unknown'
  let action = OPERATIONS_TO_ACTIONS[operation]

  const waitTimeSeconds = request.params && request.params.WaitTimeSeconds
  if(action === 'receive' && waitTimeSeconds > 0) {
    action = 'poll'
  }

  return action
}

/**
 * Returns preposition to use in span name
 *
 * RECEIVE from ...
 * SEND to ...
 */
function getToFromFromOperation(operation) {
  let result = 'from'
  if('sendMessage' === operation || 'sendMessageBatch' === operation) {
    result = 'to'
  }
  return result
}

/**
 * Parses queue/topic name from AWS queue URL
 */
function getQueueNameFromRequest(request) {
  const unknown = 'unknown'
  if(!request || !request.params || !request.params.QueueUrl) {
    return unknown
  }
  try {
    const url = new URL(request.params.QueueUrl)
    return url.pathname.split('/').pop()
  } catch {
    return unknown
  }
}

/**
 * Parses region name from AWS service configuration
 */
function getRegionFromRequest(request) {
  const region = request && request.service &&
    request.service.config && request.service.config.region
  return region ? region : ''
}

/**
 * Creates message destination context suitable for setDestinationContext
 */
function getMessagingDestinationContextFromRequest(request) {
  const destination = {
    service:{
      name:'sqs',
      resource:`sqs/${getQueueNameFromRequest(request)}`,
      type:TYPE
    },
    cloud:{
      region:getRegionFromRequest(request)
    }
  }
  return destination
}

/**
 * Measures the time spent in the function
 * call that schedules the operation.
 */
function instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled}) {
  const type = TYPE
  const action = getActionFromRequest(request)
  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(
    name,
    type,
    action
  )
  span.setDestinationContext(getMessagingDestinationContextFromRequest(request))
  // call original function
  const originalResult = orig.apply(request, origArguments)
  span.end()
  return originalResult
}

/**
 * Measures the time spent in the operation's callback
 *
 * Used to measure calls to receiveMessage
 */
function instrumentOperationCallback(orig, origArguments, request, AWS, agent, {version, enabled}) {
  origArguments[0] = wrapCallback(origArguments[0])
  // call original function
  const originalResult = orig.apply(request, origArguments)
  return originalResult

  function wrapCallback(cb) {
    return function() {
      const type = TYPE
      const action = getActionFromRequest(request)
      const name = getSpanNameFromRequest(request)
      const span = agent.startSpan(name, type, action)
      span.setDestinationContext(getMessagingDestinationContextFromRequest(request))
      // call the callback
      const result = cb && cb.apply(this, arguments)
      span.end()
      return result
    }
  }
}

/**
 * Creates the span name from request information
 */
function getSpanNameFromRequest(request) {
  const action = getActionFromRequest(request)
  const toFrom = getToFromFromOperation(request.operation)
  const queueName = getQueueNameFromRequest(request)

  const name = `SQS ${action.toUpperCase()} ${toFrom} ${queueName}`
  return name
}

function shouldIgnoreRequest(request, agent) {
  const operation = request && request.operation
  // are we interested in this operation/method call?
  if(-1 === OPERATIONS.indexOf(operation)) {
    return true
  }

  // is the named queue on our ignore list?
  if(agent._conf && agent._conf.ignoreMessageQueuesRegExp) {
    const queueName = getQueueNameFromRequest(request)
    for(const rule of agent._conf.ignoreMessageQueuesRegExp) {
      if(rule.test(queueName)) {
        return true
      }
    }
  }
  return false
}

function instrumentationSqs(orig, origArguments, request, AWS, agent, {version, enabled}) {
  if(shouldIgnoreRequest(request, agent)) {
    return orig.apply(request, origArguments)
  }
  const action = getActionFromRequest(request)

  if(action === 'receive' || action === 'poll') {
    return instrumentOperationCallback(orig, origArguments, request, AWS, agent, {version, enabled})
  } else {
    return instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled})
  }
}

module.exports = {
  instrumentationSqs,
  getToFromFromOperation,
  getActionFromRequest,
  getQueueNameFromRequest,
  getRegionFromRequest,
  getMessagingDestinationContextFromRequest,
  shouldIgnoreRequest
}
