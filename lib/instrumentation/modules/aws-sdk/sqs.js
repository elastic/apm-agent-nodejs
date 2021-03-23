'use strict'

const OPERATIONS_TO_ACTIONS = {
  deleteMessage: 'delete',
  deleteMessageBatch: 'delete_batch',
  receiveMessage: 'poll',
  sendMessageBatch: 'send_batch',
  sendMessage: 'send',
  unknown: 'unknown'
}
const OPERATIONS = Object.keys(OPERATIONS_TO_ACTIONS)
const TYPE = 'messaging'
const SUB_TYPE = 'sqs'

const queueMetics = new Map;

/**
 * Returns Message Queue action from AWS SDK method name
 */
function getActionFromRequest (request) {
  request = request || {}
  const operation = request.operation ? request.operation : 'unknown'
  let action = OPERATIONS_TO_ACTIONS[operation]

  const waitTimeSeconds = request.params && request.params.WaitTimeSeconds

  return action
}

/**
 * Returns preposition to use in span name
 *
 * POLL from ...
 * SEND to ...
 */
function getToFromFromOperation (operation) {
  let result = 'from'
  if (operation === 'sendMessage' || operation === 'sendMessageBatch') {
    result = 'to'
  }
  return result
}

/**
 * Parses queue/topic name from AWS queue URL
 */
function getQueueNameFromRequest (request) {
  const unknown = 'unknown'
  if (!request || !request.params || !request.params.QueueUrl) {
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
function getRegionFromRequest (request) {
  const region = request && request.service &&
    request.service.config && request.service.config.region
  return region || ''
}

/**
 * Creates message destination context suitable for setDestinationContext
 */
function getMessagingDestinationContextFromRequest (request) {
  const destination = {
    service: {
      name: SUB_TYPE,
      resource: `${SUB_TYPE}/${getQueueNameFromRequest(request)}`,
      type: TYPE
    },
    cloud: {
      region: getRegionFromRequest(request)
    }
  }
  return destination
}

/**
 * Measures the time spent in the function
 *
 * call that schedules the operation.
 */
function instrumentOperation (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (!agent.currentTransaction) {
    agent.logger.trace('no active transaction found, skipping sqs instrumentation')
    const originalResult = orig.apply(request, origArguments)
    return originalResult
  }
  const type = TYPE
  const subtype = SUB_TYPE
  const action = getActionFromRequest(request)
  const name = getSpanNameFromRequest(request)
  const span = agent.startSpan(name, type, subtype, action)
  span.setDestinationContext(getMessagingDestinationContextFromRequest(request))
  // call original function
  const originalResult = orig.apply(request, origArguments)
  span.end()
  return originalResult
}

function recordMetrics(queueName, data, agent) {
  const messages = data && data.Messages
  if(!messages || messages.length < 1) {
    return
  }

  if(!queueMetics.get(queueName)) {
    const collector = agent._metrics.createQueueMetricsCollector(queueName)
    queueMetics.set(queueName,collector)
  }
  const metrics = queueMetics.get(queueName)

  for(const message of messages) {
    const sentTimestamp = message.Attributes && message.Attributes.SentTimestamp
    const delay = (new Date).getTime() - sentTimestamp
    metrics.updateStats(delay)
  }
}

/**
 * Measures the time spent in the operation's callback
 *
 * Used to measure calls to receiveMessage
 */
function instrumentReceiveCallback (orig, origArguments, request, AWS, agent, { version, enabled }) {
  origArguments[0] = wrapCallback(origArguments[0])
  // call original function
  const originalResult = orig.apply(request, origArguments)
  return originalResult

  function wrapCallback (cb) {
    return function (err, data) {
      // if no transaction, just call the callback and return
      if (!agent.currentTransaction || err) {
        agent.logger.trace('no active transaction found, skipping sqs instrumentation')
        const result = cb && cb.apply(this, arguments)
        return result
      }
      recordMetrics(getQueueNameFromRequest(request), data, agent)
      const type = TYPE
      const subtype = SUB_TYPE
      const action = getActionFromRequest(request)
      const name = getSpanNameFromRequest(request)
      const span = agent.startSpan(name, type, subtype, action)
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
function getSpanNameFromRequest (request) {
  const action = getActionFromRequest(request)
  const toFrom = getToFromFromOperation(request.operation)
  const queueName = getQueueNameFromRequest(request)

  const name = `${SUB_TYPE.toUpperCase()} ${action.toUpperCase()} ${toFrom} ${queueName}`
  return name
}

function shouldIgnoreRequest (request, agent) {
  const operation = request && request.operation
  // are we interested in this operation/method call?
  if (OPERATIONS.indexOf(operation) === -1) {
    return true
  }

  // is the named queue on our ignore list?
  if (agent._conf && agent._conf.ignoreMessageQueuesRegExp) {
    const queueName = getQueueNameFromRequest(request)
    for (const rule of agent._conf.ignoreMessageQueuesRegExp) {
      if (rule.test(queueName)) {
        return true
      }
    }
  }
  return false
}

function instrumentationSqs (orig, origArguments, request, AWS, agent, { version, enabled }) {
  if (shouldIgnoreRequest(request, agent)) {
    return orig.apply(request, origArguments)
  }
  const action = getActionFromRequest(request)

  if (action === 'poll') {
    return instrumentReceiveCallback(orig, origArguments, request, AWS, agent, { version, enabled })
  } else {
    return instrumentOperation(orig, origArguments, request, AWS, agent, { version, enabled })
  }
}

module.exports = {
  instrumentationSqs,
  getToFromFromOperation,
  getActionFromRequest,
  getQueueNameFromRequest,
  getRegionFromRequest,
  getMessagingDestinationContextFromRequest,
  shouldIgnoreRequest,
}
