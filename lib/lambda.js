'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')

// used to detect cold starts
let isFirstRun = true

function setGenericData (transaction, event, context, isColdStart) {
  const faas = {
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      request_id: event && event.requestContext && event.requestContext.requestId,
      type: 'http'
    }
  }
  transaction.setFaas(faas)
}

function getSharedFaasData (context, isColdStart) {
  const faas = {
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      type: 'http'
    }
  }
  return faas
}

function setApiGatewayData (transaction, event, context, isColdStart) {
  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.request_id = event && event.requestContext && event.requestContext.requestId
  faas.trigger.type = 'http'
  transaction.setFaas(faas)

  transaction.type = 'http'
  let httpMethod = event && event.requestContext && event.requestContext.httpMethod
  if (!httpMethod) {
    httpMethod = event && event.requestContext && event.requestContext.http && event.requestContext.http.method
  }
  let path = event && event.requestContext && event.requestContext.resourcePath
  if (!path) {
    path = event && event.requestContext && event.requestContext.http.path
  }

  const stage = event && event.requestContext && event.requestContext.stage
  const apiId = event && event.requestContext && event.requestContext.apiId
  transaction.name = httpMethod + ' ' + context.functionName
  const version = (event && event.version) ? event.version : '1.0'
  const serviceContext = {
    origin: {
      name: `${httpMethod} ${path}/${stage}`,
      id: apiId,
      version: version
    }
  }
  transaction.setServiceContext(serviceContext)

  const cloudContext = {
    origin: {
      provider: 'aws'
    }
  }

  cloudContext.origin.service = {
    name: 'api gateway'
  }
  cloudContext.origin.account = {
    id: event && event.requestContext.accountId
  }
  transaction.setCloudContext(cloudContext)
}

function isApiGatewayEvent (event) {
  return !!(event && event.requestContext && event.requestContext.requestId)
}

function setSqsData (agent, transaction, event, context, isColdStart) {
  const record = event && event.Records && event.Records[0]
  record.eventSourceARN = record.eventSourceARN ? record.eventSourceARN : ''

  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.request_id = record.messageId
  faas.trigger.type = 'pubsub'
  transaction.setFaas(faas)

  const arnParts = record.eventSourceARN.split(':')
  const queueName = arnParts.pop()
  const accountId = arnParts.pop()

  transaction.name = `RECEIVE ${queueName}`
  transaction.type = 'messaging'

  const serviceContext = {
    origin: {
      name: queueName,
      id: record.eventSourceARN
    }
  }
  transaction.setServiceContext(serviceContext)

  const cloudContext = {
    origin: {
      provider: 'aws',
      region: record.awsRegion,
      service: {
        name: 'sqs'
      },
      account: {
        id: accountId
      }
    }
  }
  transaction.setCloudContext(cloudContext)

  let age
  if (record.attributes && record.attributes.SentTimestamp) {
    age = Date.now() - record.attributes.SentTimestamp
  }
  const messageContext = {
    queue: record.eventSourceARN,
    age: age,
    body: undefined,
    headers: Object.assign(record.attributes)
  }

  if (agent._conf.captureBody) {
    messageContext.body = record.body
  }
  transaction.setMessageContext(messageContext)
}

function isSqsEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length > 0 && records[0].eventSource === 'aws:sqs'
}

function setSnsData (agent, transaction, event, context, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const message = record && record.Sns
  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.type = 'pubsub'
  faas.trigger.request_id = record && record.Sns && record.Sns.MessageId

  transaction.setFaas(faas)

  let topicArn = record && record.Sns && record.Sns.TopicArn
  topicArn = topicArn || ''
  const arnParts = topicArn.split(':')
  const topicName = arnParts.pop()
  const accountId = arnParts.pop()
  const region = arnParts.pop()

  transaction.name = `RECEIVE ${topicName}`
  transaction.type = 'messaging'

  const serviceContext = {
    origin: {
      name: topicName,
      id: topicArn,
      version: record.EventVersion
    }
  }
  transaction.setServiceContext(serviceContext)

  const cloudContext = {
    origin: {
      provider: 'aws',
      region: region,
      service: {
        name: 'sns'
      },
      account: {
        id: accountId
      }
    }
  }
  transaction.setCloudContext(cloudContext)

  let age
  if (message.Timestamp) {
    age = Date.now() - (new Date(message.Timestamp).getTime())
  }
  const messageContext = {
    queue: topicArn,
    age: age,
    body: undefined,
    headers: Object.assign(message.MessageAttributes)
  }

  if (agent._conf.captureBody) {
    messageContext.body = message.Message
  }
  transaction.setMessageContext(messageContext)
}

function isSnsEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length > 0 && records[0].EventSource === 'aws:sns'
}

function setS3Data () {
}

function isS3Event (event) {

}

function setLambdaTransactionData (agent, transaction, event, context, isColdStart) {
  if (isApiGatewayEvent(event)) {
    setApiGatewayData(transaction, event, context, isColdStart)
  } else if (isSqsEvent(event)) {
    setSqsData(agent, transaction, event, context, isColdStart)
  } else if (isSnsEvent(event)) {
    setSnsData(agent, transaction, event, context, isColdStart)
  } else if (isS3Event(event)) {
    setS3Data(transaction, event, context, isColdStart)
  } else {
    // generic trigger
    setGenericData(transaction, event, context, isColdStart)
  }
}

function elasticApmAwsLambda (agent) {
  const log = agent.logger

  function captureContext (trans, event, context, result) {
    trans.setCustomContext({
      lambda: {
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        invokedFunctionArn: context.invokedFunctionArn,
        memoryLimitInMB: context.memoryLimitInMB,
        awsRequestId: context.awsRequestId,
        logGroupName: context.logGroupName,
        logStreamName: context.logStreamName,
        executionEnv: process.env.AWS_EXECUTION_ENV,
        region: process.env.AWS_REGION,
        input: event,
        output: result
      }
    })
  }

  function wrapContext (trans, event, context) {
    shimmer.wrap(context, 'succeed', (succeed) => {
      return function wrappedSucceed (result) {
        const bound = succeed.bind(this, result)
        const done = captureAndMakeCompleter(trans, event, context, result, bound)
        done()
      }
    })

    shimmer.wrap(context, 'fail', (fail) => {
      return function wrappedFail (err) {
        // Capture the error before trans.end() so it associates with the
        // current trans.  `skipOutcome` to avoid setting outcome on a possible
        // currentSpan, because this error applies to the transaction, not any
        // sub-span.
        agent.captureError(err, { skipOutcome: true })
        trans.setOutcome(constants.OUTCOME_FAILURE)
        const bound = fail.bind(this, err)
        const finish = captureAndMakeCompleter(trans, event, context, undefined, bound)
        finish()
      }
    })

    shimmer.wrap(context, 'done', (done) => {
      return wrapLambdaCallback(trans, event, context, done)
    })
  }

  function captureAndMakeCompleter (trans, event, context, result, boundCallback) {
    log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: fn end')
    captureContext(trans, event, context, result)
    trans.end()
    return () => {
      agent.flush((err) => {
        if (err) {
          log.error({ err, awsRequestId: context && context.awsRequestId }, 'lambda: flush error')
        } else {
          log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: flushed')
        }
        boundCallback()
      })
    }
  }

  function wrapLambdaCallback (trans, event, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      if (err) {
        // Capture the error before trans.end() so it associates with the
        // current trans.  `skipOutcome` to avoid setting outcome on a possible
        // currentSpan, because this error applies to the transaction, not any
        // sub-span.
        agent.captureError(err, { skipOutcome: true })
        trans.setOutcome(constants.OUTCOME_FAILURE)
      }
      const bound = callback.bind(this, err, result)
      const finish = captureAndMakeCompleter(trans, event, context, result, bound)
      finish()
    }
  }

  return function wrapLambda (type, fn) {
    if (typeof type === 'function') {
      fn = type
      type = 'lambda'
    }
    if (!agent._conf.active) {
      // Manual usage of `apm.lambda(...)` should be a no-op when not active.
      return fn
    }

    return function wrappedLambda (event, context, callback) {
      log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: fn start')
      let parentId
      let tracestate
      if (event.headers !== undefined) {
        const normalizedHeaders = {}
        for (const key of Object.keys(event.headers)) {
          const value = event.headers[key]
          const lowerCaseKey = key.toLowerCase()
          normalizedHeaders[lowerCaseKey] = value
        }
        parentId = normalizedHeaders.traceparent ? normalizedHeaders.traceparent : normalizedHeaders['elastic-apm-traceparent']
        tracestate = normalizedHeaders.tracestate
      }
      const isColdStart = !!isFirstRun
      if (isFirstRun) {
        isFirstRun = false
      }

      const transaction = agent.startTransaction(context.functionName, type, {
        childOf: parentId,
        tracestate: tracestate
      })

      setLambdaTransactionData(agent, transaction, event, context, isColdStart)

      // Wrap context and callback to finish and send transaction
      wrapContext(transaction, event, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(transaction, event, context, callback)
      }

      try {
        return fn.call(this, event, context, callback)
      } catch (handlerErr) {
        callback(handlerErr)
      }
    }
  }
}

function isLambdaExecutionEnviornment () {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

module.exports = {
  elasticApmAwsLambda,

  // exported for testing
  isLambdaExecutionEnviornment,
  setLambdaTransactionData
}
