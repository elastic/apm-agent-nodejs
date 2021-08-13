'use strict'

const shimmer = require('./instrumentation/shimmer')

// used to detect cold starts
let isFirstRun = false

function getTriggerTypeFromEvent (event) {
  if (event && event.requestContext && event.requestContext.requestId) {
    return 'http'
  }
  return 'other'
}

function setLambdaTransactionData (transaction, event, context, isColdStart) {
  const faas = {
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      request_id: event && event.requestContext && event.requestContext.requestId,
      type: getTriggerTypeFromEvent(event)
    }
  }
  transaction.setFaas(faas)
}

function elasticApmAwsLambda (agent) {
  function captureContext (trans, payload, context, result) {
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
        input: payload,
        output: result
      }
    })
  }

  function wrapContext (trans, payload, context) {
    shimmer.wrap(context, 'succeed', (succeed) => {
      return function wrappedSucceed (result) {
        const bound = succeed.bind(this, result)
        const done = captureAndMakeCompleter(trans, payload, context, result, bound)
        done()
      }
    })

    shimmer.wrap(context, 'fail', (fail) => {
      return function wrappedFail (err) {
        const bound = fail.bind(this, err)
        const done = captureAndMakeCompleter(trans, payload, context, undefined, bound)
        agent.captureError(err, done)
      }
    })

    shimmer.wrap(context, 'done', (done) => {
      return wrapLambdaCallback(trans, payload, context, done)
    })
  }

  function captureAndMakeCompleter (trans, payload, context, result, callback) {
    captureContext(trans, payload, context, result)
    trans.end()
    return () => {
      agent.flush((err) => {
        if (err) agent.logger.error('Flush error: %s', err.message)
        callback()
      })
    }
  }

  function wrapLambdaCallback (trans, payload, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      const bound = callback.bind(this, err, result)
      const done = captureAndMakeCompleter(trans, payload, context, result, bound)
      if (err) {
        agent.captureError(err, done)
      } else {
        done()
      }
    }
  }

  return function wrapLambda (type, fn) {
    if (typeof type === 'function') {
      fn = type
      type = 'lambda'
    }

    return function wrappedLambda (event, context, callback) {
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

      setLambdaTransactionData(transaction, event, context, isColdStart)

      // Wrap context and callback to finish and send transaction
      wrapContext(transaction, event, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(transaction, event, context, callback)
      }

      return fn.call(this, event, context, callback)
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
