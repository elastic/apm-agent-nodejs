'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#deriving-cold-starts
let isFirstRun = true

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#overwriting-metadata
function getLambdaMetadata (context) {
  // E.g. 'arn:aws:lambda:us-west-2:123456789012:function:my-function:someAlias'
  const arnParts = context.invokedFunctionArn.split(':')
  const serviceId = arnParts.slice(0, 7).join(':')
  const cloudAccountId = arnParts[4]

  const lambdaMetadata = {
    service: {
      name: process.env.AWS_LAMBDA_FUNCTION_NAME,
      id: serviceId,
      version: process.env.AWS_LAMBDA_FUNCTION_VERSION,
      framework: {
        // Passing this service.framework.name to Client#setExtraMetadata()
        // ensures that it "wins" over a framework name from
        // `agent.setFramework()`, because in the client `_extraMetadata`
        // wins over `_conf.metadata`.
        name: 'AWS Lambda'
      },
      runtime: {
        name: process.env.AWS_EXECUTION_ENV
      },
      node: {
        configured_name: process.env.AWS_LAMBDA_LOG_STREAM_NAME
      }
    },
    cloud: {
      provider: 'aws',
      region: process.env.AWS_REGION,
      service: {
        name: 'lambda'
      },
      account: {
        id: cloudAccountId
      }
    }
  }
  return lambdaMetadata
}

function shouldCaptureBody (agent) {
  return agent._conf.captureBody === 'all' || agent._conf.captureBody === 'transactions'
}

function setGenericData (trans, event, context, isColdStart) {
  const faas = {
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      type: 'other'
    }
  }

  trans.type = 'request'
  trans.name = context.functionName
  trans.result = constants.RESULT_SUCCESS

  trans.setFaas(faas)

  const cloudContext = {
    origin: {
      provider: 'aws'
    }
  }
  trans.setCloudContext(cloudContext)
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

function setApiGatewayData (trans, event, context, isColdStart) {
  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.request_id = event.requestContext.requestId
  faas.trigger.type = 'http'
  trans.setFaas(faas)

  trans.type = 'request'

  // Handle API Gateway payload format versions 1.0 and 2.0.
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  let httpMethod
  let originName
  if (event.requestContext.http) {
    httpMethod = event.requestContext.http.method
    originName = `${event.requestContext.http.method} ${event.requestContext.http.path}`
  } else {
    httpMethod = event.requestContext.httpMethod
    originName = `${event.requestContext.httpMethod} ${event.requestContext.path}`
  }

  const apiId = event.requestContext.apiId
  trans.name = httpMethod + ' ' + context.functionName
  const version = (event && event.version) ? event.version : '1.0'
  const serviceContext = {
    origin: {
      name: originName,
      id: apiId,
      version: version
    }
  }
  trans.setServiceContext(serviceContext)

  const cloudContext = {
    origin: {
      provider: 'aws',
      service: {
        name: 'api gateway'
      },
      account: {
        id: event && event.requestContext.accountId
      }
    }
  }
  trans.setCloudContext(cloudContext)
}

function isApiGatewayEvent (event) {
  return !!(event && event.requestContext && event.requestContext.requestId)
}

function setSqsData (agent, trans, event, context, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const eventSourceARN = record.eventSourceARN ? record.eventSourceARN : ''

  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.request_id = record.messageId
  faas.trigger.type = 'pubsub'
  trans.setFaas(faas)

  const arnParts = eventSourceARN.split(':')
  const queueName = arnParts[5]
  const accountId = arnParts[4]

  trans.name = `RECEIVE ${queueName}`
  trans.type = 'messaging'

  const serviceContext = {
    origin: {
      name: queueName,
      id: eventSourceARN
    }
  }
  trans.setServiceContext(serviceContext)

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
  trans.setCloudContext(cloudContext)

  let age
  if (record.attributes && record.attributes.SentTimestamp) {
    age = Date.now() - record.attributes.SentTimestamp
  }
  const messageContext = {
    queue: {
      name: queueName
    },
    age: {
      ms: age
    },
    body: undefined,
    headers: undefined
  }

  if (agent._conf.captureHeaders) {
    messageContext.headers = Object.assign({}, record.messageAttributes)
  }

  if (shouldCaptureBody(agent)) {
    messageContext.body = record.body
  }
  trans.setMessageContext(messageContext)
}

function isSqsSingleEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length === 1 && records[0].eventSource === 'aws:sqs'
}

function setSnsData (agent, trans, event, context, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const message = record && record.Sns
  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.type = 'pubsub'
  faas.trigger.request_id = record && record.Sns && record.Sns.MessageId

  trans.setFaas(faas)

  let topicArn = record && record.Sns && record.Sns.TopicArn
  topicArn = topicArn || ''
  const arnParts = topicArn.split(':')
  const topicName = arnParts[5]
  const accountId = arnParts[4]
  const region = arnParts[3]

  trans.name = `RECEIVE ${topicName}`
  trans.type = 'messaging'

  const serviceContext = {
    origin: {
      name: topicName,
      id: topicArn,
      version: record.EventVersion
    }
  }
  trans.setServiceContext(serviceContext)

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
  trans.setCloudContext(cloudContext)

  let age
  if (message.Timestamp) {
    age = Date.now() - (new Date(message.Timestamp).getTime())
  }
  const messageContext = {
    queue: {
      name: topicName
    },
    age: {
      ms: age
    },
    body: undefined,
    headers: undefined
  }
  if (agent._conf.captureHeaders) {
    messageContext.headers = Object.assign({}, message.MessageAttributes)
  }

  if (shouldCaptureBody(agent)) {
    messageContext.body = message.Message
  }
  trans.setMessageContext(messageContext)
}

function isSnsEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length === 1 && records[0].EventSource === 'aws:sns'
}

function setS3SingleData (trans, event, context, isColdStart) {
  const record = event.Records[0]
  const faas = getSharedFaasData(context, isColdStart)
  faas.trigger.type = 'datasource'
  faas.trigger.request_id = record.responseElements && record.responseElements['x-amz-request-id']

  trans.setFaas(faas)
  trans.name = `${record && record.eventName} ${record && record.s3 && record.s3.bucket && record.s3.bucket.name}`
  trans.type = 'request'

  const serviceContext = {
    origin: {
      name: record && record.s3 && record.s3.bucket && record.s3.bucket.name,
      id: record && record.s3 && record.s3.bucket && record.s3.bucket.arn,
      version: record.eventVersion
    }
  }
  trans.setServiceContext(serviceContext)

  const cloudContext = {
    origin: {
      provider: 'aws',
      service: {
        name: 's3'
      },
      region: record.awsRegion
    }
  }
  trans.setCloudContext(cloudContext)
}

function isS3SingleEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length === 1 && records[0].eventSource === 'aws:s3'
}

function setLambdaTransactionData (agent, trans, event, context, isColdStart) {
  setGenericData(trans, event, context, isColdStart)
  if (isApiGatewayEvent(event)) {
    setApiGatewayData(trans, event, context, isColdStart)
  } else if (isSqsSingleEvent(event)) {
    setSqsData(agent, trans, event, context, isColdStart)
  } else if (isSnsEvent(event)) {
    setSnsData(agent, trans, event, context, isColdStart)
  } else if (isS3SingleEvent(event)) {
    setS3SingleData(trans, event, context, isColdStart)
  }
}

function elasticApmAwsLambda (agent) {
  const log = agent.logger

  function endAndFlushTransaction (err, result, trans, event, context, cb) {
    log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: fn end')

    const isApiGatewayTriggered = isApiGatewayEvent(event)
    if (err) {
      // Capture the error before trans.end() so it associates with the
      // current trans.  `skipOutcome` to avoid setting outcome on a possible
      // currentSpan, because this error applies to the transaction, not any
      // sub-span.
      agent.captureError(err, { skipOutcome: true })
      trans.setOutcome(constants.OUTCOME_FAILURE)
      if (isApiGatewayTriggered) {
        trans.result = 'HTTP 5xx'
      } else {
        trans.result = constants.RESULT_FAILURE
      }
    } else {
      trans.setOutcome(constants.OUTCOME_SUCCESS)
      if (isApiGatewayTriggered && result && result.statusCode) {
        trans.result = 'HTTP ' + result.statusCode.toString()[0] + 'xx'
      } else {
        trans.result = constants.RESULT_SUCCESS
      }
    }

    trans.end()

    agent.flush(flushErr => {
      if (flushErr) {
        log.error({ flushErr, awsRequestId: context && context.awsRequestId }, 'lambda: flush error')
      } else {
        log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: flushed')
      }
      cb()
    })
  }

  function wrapContext (trans, event, context) {
    shimmer.wrap(context, 'succeed', (origSucceed) => {
      return function wrappedSucceed (result) {
        endAndFlushTransaction(null, result, trans, event, context, function () {
          origSucceed(result)
        })
      }
    })

    shimmer.wrap(context, 'fail', (origFail) => {
      return function wrappedFail (err) {
        endAndFlushTransaction(err, null, trans, event, context, function () {
          origFail(err)
        })
      }
    })

    shimmer.wrap(context, 'done', (origDone) => {
      return wrapLambdaCallback(trans, event, context, origDone)
    })
  }

  function wrapLambdaCallback (trans, event, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      endAndFlushTransaction(err, result, trans, event, context, () => {
        callback(err, result)
      })
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

      const isColdStart = isFirstRun
      if (isFirstRun) {
        isFirstRun = false
        if (agent._transport) {
          log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: setExtraMetadata')
          agent._transport.setExtraMetadata(getLambdaMetadata(context))
        }
      }

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

      const trans = agent.startTransaction(context.functionName, type, {
        childOf: parentId,
        tracestate: tracestate
      })

      setLambdaTransactionData(agent, trans, event, context, isColdStart)

      // Wrap context and callback to finish and send transaction
      wrapContext(trans, event, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(trans, event, context, callback)
      }

      try {
        return fn.call(this, event, context, callback)
      } catch (handlerErr) {
        callback(handlerErr)
      }
    }
  }
}

function isLambdaExecutionEnvironment () {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

function getLambdaHandler(env) {
  if(!isLambdaExecutionEnvironment() || !env._HANDLER || !env.LAMBDA_TASK_ROOT) {
    return
  }

  const [handlerModule, handlerFunction, extra] = env._HANDLER.split('.')
  if(!handlerModule || !handlerFunction || extra) {
    return
  }

  const filePath = `${env.LAMBDA_TASK_ROOT}/${handlerModule}.js`

  return {
    filePath:filePath,
    module:handlerModule,
    field:handlerFunction,
  }
}

module.exports = {
  elasticApmAwsLambda,
  isLambdaExecutionEnvironment,

  // exported for testing
  setLambdaTransactionData,
  getLambdaHandler
}
