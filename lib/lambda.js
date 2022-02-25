'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')
const fs = require('fs')
const path = require('path')

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#deriving-cold-starts
let isFirstRun = true
let gFaasId // Set on first invocation.

// Gather APM metadata for this Lambda executor per
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#overwriting-metadata
function getMetadata (agent, cloudAccountId) {
  return {
    service: {
      name: (agent._conf._serviceNameFrom === 'config'
        ? agent._conf.serviceName
        : process.env.AWS_LAMBDA_FUNCTION_NAME),
      version: (agent._conf._serviceVersionFrom === 'config'
        ? agent._conf.serviceVersion
        : process.env.AWS_LAMBDA_FUNCTION_VERSION),
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
}

function shouldCaptureBody (agent) {
  return agent._conf.captureBody === 'all' || agent._conf.captureBody === 'transactions'
}

function getFaasData (context, faasId, isColdStart, triggerType, requestId) {
  const faasData = {
    id: faasId,
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      type: triggerType
    }
  }
  if (requestId) {
    faasData.trigger.request_id = requestId
  }
  return faasData
}

function setGenericData (trans, event, context, faasId, isColdStart) {
  trans.type = 'request'
  trans.name = context.functionName

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'other'))

  const cloudContext = {
    origin: {
      provider: 'aws'
    }
  }
  trans.setCloudContext(cloudContext)
}

// Set transaction data for an API Gateway triggered invocation.
//
// Handle API Gateway payload format vers 1.0 (a.k.a "REST") and 2.0 ("HTTP").
// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
function setApiGatewayData (agent, trans, event, context, faasId, isColdStart) {
  const requestContext = event.requestContext

  let name
  if (requestContext.http) { // 2.0
    if (agent._conf.usePathAsTransactionName) {
      name = `${requestContext.http.method} ${requestContext.http.path}`
    } else {
      // Get a routeKeyPath from the routeKey:
      //    GET /some/path  ->  /some/path
      //    ANY /some/path  ->  /some/path
      //    $default        ->  /$default
      let routeKeyPath = requestContext.routeKey
      const spaceIdx = routeKeyPath.indexOf(' ')
      if (spaceIdx === -1) {
        routeKeyPath = '/' + routeKeyPath
      } else {
        routeKeyPath = routeKeyPath.slice(spaceIdx + 1)
      }
      name = `${requestContext.http.method} /${requestContext.stage}${routeKeyPath}`
    }
  } else { // 1.0
    if (agent._conf.usePathAsTransactionName) {
      name = `${requestContext.httpMethod} ${requestContext.path}`
    } else {
      name = `${requestContext.httpMethod} /${requestContext.stage}${requestContext.resourcePath}`
    }
  }
  trans.type = 'request'
  trans.name = name

  trans.setFaas(getFaasData(context, faasId, isColdStart,
    'http', requestContext.requestId))

  const serviceContext = {
    origin: {
      name: requestContext.domainName,
      id: requestContext.apiId,
      version: event.version || '1.0'
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

function setSqsData (agent, trans, event, context, faasId, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const eventSourceARN = record.eventSourceARN ? record.eventSourceARN : ''

  trans.setFaas(getFaasData(context, faasId, isColdStart,
    'pubsub', record.messageId))

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

function setSnsData (agent, trans, event, context, faasId, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const message = record && record.Sns

  trans.setFaas(getFaasData(context, faasId, isColdStart,
    'pubsub', record && record.Sns && record.Sns.MessageId))

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

function isSnsSingleEvent (event) {
  const records = event.Records ? event.Records : []
  return records.length === 1 && records[0].EventSource === 'aws:sns'
}

function setS3SingleData (trans, event, context, faasId, isColdStart) {
  const record = event.Records[0]

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'datasource',
    record.responseElements && record.responseElements['x-amz-request-id']))

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

function setLambdaTransactionData (agent, trans, event, context, faasId, isColdStart) {
  if (isApiGatewayEvent(event)) {
    setApiGatewayData(agent, trans, event, context, faasId, isColdStart)
  } else if (isSqsSingleEvent(event)) {
    setSqsData(agent, trans, event, context, faasId, isColdStart)
  } else if (isSnsSingleEvent(event)) {
    setSnsData(agent, trans, event, context, faasId, isColdStart)
  } else if (isS3SingleEvent(event)) {
    setS3SingleData(trans, event, context, faasId, isColdStart)
  } else {
    setGenericData(trans, event, context, faasId, isColdStart)
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

        // E.g. 'arn:aws:lambda:us-west-2:123456789012:function:my-function:someAlias'
        const arnParts = context.invokedFunctionArn.split(':')
        gFaasId = arnParts.slice(0, 7).join(':')
        const cloudAccountId = arnParts[4]

        if (agent._transport) {
          log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: setExtraMetadata')
          agent._transport.setExtraMetadata(getMetadata(agent, cloudAccountId))
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

      setLambdaTransactionData(agent, trans, event, context, gFaasId, isColdStart)

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

function findHandlerNameInModules (handlerModule, modules) {
  for (let instrumentedModules of modules) {
    // array.flat didn't come around until Node 11
    if (!Array.isArray(instrumentedModules)) {
      instrumentedModules = [instrumentedModules]
    }
    for (const instrumentedModule of instrumentedModules) {
      if (handlerModule === instrumentedModule) {
        return true
      }
    }
  }
  return false
}

function getFilePath (taskRoot, handlerModule, pathParts) {
  let filePath = path.resolve(taskRoot,`${handlerModule}.js`)
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(taskRoot,`${handlerModule}.cjs`)
  }
  return filePath
}

function getLambdaHandlerInfo (env, modules, logger) {
  if (!isLambdaExecutionEnvironment() || !env._HANDLER || !env.LAMBDA_TASK_ROOT) {
    return
  }

  // extract module name and "path" from handler using the same regex as the runtime
  // from https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/c31c41ffe5f2f03ae9e8589b96f3b005e2bb8a4a/src/utils/UserFunction.ts#L21
  const functionExpression = /^([^.]*)\.(.*)$/
  const match = env._HANDLER.match(functionExpression)
  if (!match || match.length !== 3) {
    return
  }
  const handlerModule = match[1]
  const handlerFunctionPath = match[2]

  // if there's a name conflict with an already instrumented module, skip the
  // instrumentation of the lambda handle and log a message.
  if (findHandlerNameInModules(handlerModule, modules)) {
    logger.info(
      'Unable to instrument Lambda handler due to name conflict with %s, please choose a different Lambda handler name',
      handlerModule
    )
    return
  }

  const handlerFilePath = getFilePath(env.LAMBDA_TASK_ROOT, handlerModule)

  return {
    filePath: handlerFilePath,
    module: handlerModule,
    field: handlerFunctionPath
  }
}

module.exports = {
  isLambdaExecutionEnvironment,
  elasticApmAwsLambda,
  setLambdaTransactionData,
  getLambdaHandlerInfo
}
