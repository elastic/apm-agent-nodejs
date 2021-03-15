'use strict'

const OPERATIONS_TO_ACTIONS = {
  "deleteMessage"       : "delete",
  "deleteMessageBatch"  : "delete_batch",
  "receiveMessage"      : "receive",
  "sendMessageBatch"    : "send_batch",
  "sendMessage"         : "send"
}
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS)
const TYPE = 'messaging'

/**
 * Returns Message Queue action from AWS SDK method name
 */
function getActionFromOperation(operation) {
  return OPERATIONS_TO_ACTIONS[operation]
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
  if(!request.params || !request.params.QueueUrl) {
    return 'unknown'
  }
  const url = new URL(request.params.QueueUrl)
  return url.href.split('/').pop()
}

/**
 * Parses region name from AWS service configuration
 */
function getRegionFromRequest(request) {
  const region = request.service &&
    request.service.config &&
    request.service.config.region
  return region ? region : ''
}

/**
 * Creates message destination context suitable for setDestinationContext
 */
function getMessagingDestinationContext(request) {
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
  const action = getActionFromOperation(request.operation)
  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(
    name,
    type,
    action
  )
  span.setDestinationContext(getMessagingDestinationContext(request))
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
      const action = getActionFromOperation(request.operation)
      const name = getSpanNameFromRequest(request)
      const span = agent.startSpan(name, type, action)
      span.setDestinationContext(getMessagingDestinationContext(request))
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
  const action = getActionFromOperation(request.operation)
  const toFrom = getToFromFromOperation(request.operation)
  const queueName = getQueueNameFromRequest(request)

  const name = `SQS ${action.toUpperCase()} ${toFrom} ${queueName}`
  return name
}

/**
 * Adds tracecontext information to request
 *
 * This function adds the traceparent and tracestate information
 * to the individual message being added to the queue.  This information
 * will be read back when the user receives messages off the queue.
 */
function addTraceContextHeadersToParams(transaction, request) {
  request.params.MessageAttributes =
    request.params.MessageAttributes ? request.params.MessageAttributes : {}

  request.params.MessageAttributes.ELASTIC_TRACECONTEXT = {
    DataType: 'String',
    StringValue: JSON.stringify({
      traceparent: transaction.traceparent,
      tracestate: transaction.tracestate
    })
  }
}

function instrumentationSqs(orig, origArguments, request, AWS, agent, {version, enabled}) {
  if(-1 === OPERATIONS.indexOf(request.operation)) {
    return orig.apply(request, origArguments)
  }
  const action = getActionFromOperation(request.operation)

  if((action === 'send' || action === 'sendMessage') && agent.currentTransaction) {
    addTraceContextHeadersToParams(agent.currentTransaction, request)
  }

  if(action === 'receive') {
    return instrumentOperationCallback(orig, origArguments, request, AWS, agent, {version, enabled})
  } else {
    // console.log(agent.currentTransaction.traceparent)
    // console.log(agent.currentTransaction.tracestate)
    return instrumentOperation(orig, origArguments, request, AWS, agent, {version, enabled})
  }
}

module.exports = {
  instrumentationSqs,
  getToFromFromOperation
}
