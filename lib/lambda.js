'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')
const fs = require('fs')
const path = require('path')

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#deriving-cold-starts
let isFirstRun = true
let gFaasId // Set on first invocation.

// The trigger types for which we support special handling.
// https://docs.aws.amazon.com/lambda/latest/dg/lambda-services.html
const TRIGGER_GENERIC = 1
const TRIGGER_API_GATEWAY = 2
const TRIGGER_SNS_SINGLE_EVENT = 3
const TRIGGER_SQS_SINGLE_EVENT = 4
const TRIGGER_S3_SINGLE_EVENT = 5

function triggerTypeFromEvent (event) {
  if (event.requestContext && event.requestContext.requestId) {
    return TRIGGER_API_GATEWAY
  } else if (event.Records && event.Records.length === 1) {
    const record = event.Records[0]
    if (record.eventSource !== undefined) {
      if (record.eventSource === 'aws:s3') {
        return TRIGGER_S3_SINGLE_EVENT
      } else if (record.eventSource === 'aws:sqs') {
        return TRIGGER_SQS_SINGLE_EVENT
      }
    } else if (record.EventSource !== undefined && record.EventSource === 'aws:sns') {
      return TRIGGER_SNS_SINGLE_EVENT
    }
  }
  return TRIGGER_GENERIC
}

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

function getFaasData (context, faasId, isColdStart, faasTriggerType, requestId) {
  const faasData = {
    id: faasId,
    name: context.functionName,
    version: context.functionVersion,
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      type: faasTriggerType
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
    const headers = headersFromSqsMessageAttributes(record.messageAttributes)
    if (Object.keys(headers).length > 0) {
      messageContext.headers = headers
    }
  }

  if (shouldCaptureBody(agent)) {
    messageContext.body = record.body
  }
  trans.setMessageContext(messageContext)
}

function setSnsData (agent, trans, event, context, faasId, isColdStart) {
  const record = event && event.Records && event.Records[0]
  const sns = record && record.Sns

  trans.setFaas(getFaasData(context, faasId, isColdStart,
    'pubsub', sns && sns.MessageId))

  const topicArn = (sns && sns.TopicArn) || ''
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

  if (sns) {
    let age
    if (sns.Timestamp) {
      age = Date.now() - (new Date(sns.Timestamp).getTime())
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
      const headers = headersFromSnsMessageAttributes(sns.MessageAttributes)
      if (Object.keys(headers).length > 0) {
        messageContext.headers = headers
      }
    }

    if (shouldCaptureBody(agent)) {
      messageContext.body = sns.Message
    }
    trans.setMessageContext(messageContext)
  }
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

function elasticApmAwsLambda (agent) {
  const log = agent.logger

  function endAndFlushTransaction (err, result, trans, event, context, triggerType, cb) {
    log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: fn end')

    if (err) {
      // Capture the error before trans.end() so it associates with the
      // current trans.  `skipOutcome` to avoid setting outcome on a possible
      // currentSpan, because this error applies to the transaction, not any
      // sub-span.
      agent.captureError(err, { skipOutcome: true })
      trans.setOutcome(constants.OUTCOME_FAILURE)
      if (triggerType === TRIGGER_API_GATEWAY) {
        trans.result = 'HTTP 5xx'
      } else {
        trans.result = constants.RESULT_FAILURE
      }
    } else {
      trans.setOutcome(constants.OUTCOME_SUCCESS)
      if (triggerType === TRIGGER_API_GATEWAY && result && result.statusCode) {
        trans.result = 'HTTP ' + result.statusCode.toString()[0] + 'xx'
      } else {
        trans.result = constants.RESULT_SUCCESS
      }
    }

    trans.end()

    agent._flush({ lambdaEnd: true, inflightTimeout: 100 }, flushErr => {
      if (flushErr) {
        log.error({ err: flushErr, awsRequestId: context && context.awsRequestId }, 'lambda: flush error')
      }
      log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: wrapper end')
      cb()
    })
  }

  function wrapContext (trans, event, context, triggerType) {
    shimmer.wrap(context, 'succeed', (origSucceed) => {
      return function wrappedSucceed (result) {
        endAndFlushTransaction(null, result, trans, event, context, triggerType, function () {
          origSucceed(result)
        })
      }
    })

    shimmer.wrap(context, 'fail', (origFail) => {
      return function wrappedFail (err) {
        endAndFlushTransaction(err, null, trans, event, context, triggerType, function () {
          origFail(err)
        })
      }
    })

    shimmer.wrap(context, 'done', (origDone) => {
      return wrapLambdaCallback(trans, event, context, triggerType, origDone)
    })
  }

  function wrapLambdaCallback (trans, event, context, triggerType, callback) {
    return function wrappedLambdaCallback (err, result) {
      endAndFlushTransaction(err, result, trans, event, context, triggerType, () => {
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
      if (!(event && context && typeof callback === 'function')) {
        // Skip instrumentation if arguments are unexpected.
        // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
        return fn.call(this, ...arguments)
      }
      log.trace({ awsRequestId: context.awsRequestId }, 'lambda: fn start')

      const isColdStart = isFirstRun
      if (isFirstRun) {
        isFirstRun = false

        // E.g. 'arn:aws:lambda:us-west-2:123456789012:function:my-function:someAlias'
        const arnParts = context.invokedFunctionArn.split(':')
        gFaasId = arnParts.slice(0, 7).join(':')
        const cloudAccountId = arnParts[4]

        if (agent._transport) {
          log.trace({ awsRequestId: context.awsRequestId }, 'lambda: setExtraMetadata')
          agent._transport.setExtraMetadata(getMetadata(agent, cloudAccountId))
        }
      }

      if (agent._transport) {
        agent._transport.lambdaStart()
      }

      const triggerType = triggerTypeFromEvent(event)

      // Look for trace-context info in headers or messageAttributes.
      let traceparent
      let tracestate
      let normedHeaders
      if (triggerType === TRIGGER_API_GATEWAY) {
        if (event.headers) {
          normedHeaders = lowerCaseObjectKeys(event.headers)
        }
      } else if (triggerType === TRIGGER_SQS_SINGLE_EVENT) {
        const record = event.Records[0]
        if (record.messageAttributes) {
          normedHeaders = lowerCaseObjectKeys(headersFromSqsMessageAttributes(record.messageAttributes))
        }
      } else if (triggerType === TRIGGER_SNS_SINGLE_EVENT) {
        const record = event.Records[0]
        if (record.Sns && record.Sns.MessageAttributes) {
          normedHeaders = lowerCaseObjectKeys(headersFromSnsMessageAttributes(record.Sns.MessageAttributes))
        }
      }
      if (normedHeaders) {
        traceparent = normedHeaders.traceparent || normedHeaders['elastic-apm-traceparent']
        tracestate = normedHeaders.tracestate
      }

      // Start the transaction and set some possibly trigger-specific data.
      const trans = agent.startTransaction(context.functionName, type, {
        childOf: traceparent,
        tracestate: tracestate
      })
      switch (triggerType) {
        case TRIGGER_API_GATEWAY:
          setApiGatewayData(agent, trans, event, context, gFaasId, isColdStart)
          break
        case TRIGGER_SQS_SINGLE_EVENT:
          setSqsData(agent, trans, event, context, gFaasId, isColdStart)
          break
        case TRIGGER_SNS_SINGLE_EVENT:
          setSnsData(agent, trans, event, context, gFaasId, isColdStart)
          break
        case TRIGGER_S3_SINGLE_EVENT:
          setS3SingleData(trans, event, context, gFaasId, isColdStart)
          break
        case TRIGGER_GENERIC:
          setGenericData(trans, event, context, gFaasId, isColdStart)
          break
        default:
          log.warn(`not setting transaction data for triggerType=${triggerType}`)
      }

      // Wrap context and callback to finish and send transaction
      wrapContext(trans, event, context, triggerType)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(trans, event, context, triggerType, callback)
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

function isHandlerNameInModules (handlerModule, modules) {
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

// Returns the full file path to the user's handler handler module
//
// The Lambda Runtime allows a user's handler module to have either a .js or
// .cjs extension.  The getFilePath looks for a .js file first, and if not found
// presumes a csj file exists. If neither file exists this means the user either
// as a misconfigured handler (they'd never reach this code) or is using a
// .mjs file extension (which indicates an ECMAScript/import module, which the
// agent does not support.
//
// @param string taskRoot
// @param string handlerModule
// @return string
function getFilePath (taskRoot, handlerModule) {
  let filePath = path.resolve(taskRoot, `${handlerModule}.js`)
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(taskRoot, `${handlerModule}.cjs`)
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
  if (isHandlerNameInModules(handlerModule, modules)) {
    logger.warn(
      'Unable to instrument Lambda handler "%s" due to name conflict with "%s", please choose a different Lambda handler name',
      env._HANDLER, handlerModule
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

// wraps a nested property on the module object with the lambda handler
// @param string field ex. "foo.baz.bar"
// @param object module
function wrapNestedPath (agent, field, module) {
  const parts = field.split('.')
  let object = module
  while (parts.length > 0) {
    const prop = parts.shift()
    if (parts.length === 0 && object[prop]) {
      object[prop] = agent.lambda(object[prop])
    } else {
      object = object[prop]
    }
    if (!object) {
      break
    }
  }
}

function lowerCaseObjectKeys (obj) {
  const lowerCased = {}
  for (const key of Object.keys(obj)) {
    lowerCased[key.toLowerCase()] = obj[key]
  }
  return lowerCased
}

// Reduce a SQS record message attributes object to a headers-like object of
// string key/value-pairs. Some attribute types are ignored.
// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-metadata.html#message-attribute-data-types
//
// `record.messageAttributes` is of the form:
//    { <attribute-name>: { dataType: <attr-type>, stringValue: <attr-value>, ... } }
// For example:
//    { traceparent: { dataType: 'String', stringValue: 'test-traceparent' } }
function headersFromSqsMessageAttributes (messageAttributes) {
  const headers = {}
  for (const name of Object.keys(messageAttributes)) {
    const attr = messageAttributes[name]
    if (attr.dataType === 'String') {
      headers[name] = attr.stringValue
    } else if (attr.dataType === 'Number' && typeof attr.stringValue === 'string') {
      headers[name] = attr.stringValue
    }
  }
  return headers
}

// Reduce a SNS record message attributes object to a headers-like object of
// string key/value-pairs. Some attribute types are ignored.
// https://docs.aws.amazon.com/sns/latest/dg/sns-message-attributes.html
//
// `record.Sns.MessageAttributes` is of the form:
//    { <attribute-name>: { Type: <attr-type>, Value: <attr-value> } }
// For example:
//    { traceparent: { Type: 'String', Value: 'test-traceparent' } }
function headersFromSnsMessageAttributes (messageAttributes) {
  const headers = {}
  for (const name of Object.keys(messageAttributes)) {
    const attr = messageAttributes[name]
    if (attr.Type === 'String') {
      headers[name] = attr.Value
    }
  }
  return headers
}

module.exports = {
  isLambdaExecutionEnvironment,
  elasticApmAwsLambda,
  getLambdaHandlerInfo,
  wrapNestedPath
}
