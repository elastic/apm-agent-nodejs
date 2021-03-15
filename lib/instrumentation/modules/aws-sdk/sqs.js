'use strict'

const OPERATIONS_TO_ACTIONS = {
  "deleteMessage"       : "delete",
  "deleteMessageBatch"  : "delete_batch",
  "receiveMessage"      : "receive",
  "sendMessageBatch"    : "send_batch",
  "sendMessage"         : "send"
}
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS)
const SPAN_TYPE = 'messaging'

function getActionFromOperation(operation) {
  return OPERATIONS_TO_ACTIONS[operation]
}

function getToFromFromOperation(operation) {
  let result = 'from'
  if('sendMessage' === operation || 'sendMessageBatch' === operation) {
    result = 'to'
  }
  return result
}

function getQueueNameFromRequest(request) {
  if(!request.params || !request.params.QueueUrl) {
    return 'unknown'
  }
  const url = new URL(request.params.QueueUrl)
  return url.href.split('/').pop()
}

function isReceiveSpan(span) {
  console.log(span.name)
  return 0 === span.name.indexOf('SQS RECEIVE')
}

/**
 * Measures the time spent in the function
 * call that schedules the operation.
 */
function instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled}) {
  const type = SPAN_TYPE
  const action = getActionFromOperation(request.operation)
  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(
    name,
    type,
    action
  )

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
      const type = SPAN_TYPE
      const action = getActionFromOperation(request.operation)
      const name = getSpanNameFromRequest(request)
      const span = agent.startSpan(name, type, action)
      // call the callback
      const result = cb && cb.apply(this, arguments)
      span.end()
      return result
    }
  }
}

function getSpanNameFromRequest(request) {
  const action = getActionFromOperation(request.operation)
  const toFrom = getToFromFromOperation(request.operation)
  const queueName = getQueueNameFromRequest(request)

  const name = `SQS ${action.toUpperCase()} ${toFrom} ${queueName}`
  return name
}

module.exports = function instrumentationSqs(orig, origArguments, request, AWS, agent, {version, enabled}) {
  if(-1 === OPERATIONS.indexOf(request.operation)) {
    return orig.apply(request, origArguments)
  }
  const action = getActionFromOperation(request.operation)
  if(action === 'receive') {
    return instrumentOperationCallback(orig, origArguments, request, AWS, agent, {version, enabled})
  } else {
    return instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled})
  }
}
