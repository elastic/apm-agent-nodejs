'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')

// used to detect cold starts
let isFirstRun = true

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
  const log = agent.logger

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
        // Capture the error before trans.end() so it associates with the
        // current trans.  `skipOutcome` to avoid setting outcome on a possible
        // currentSpan, because this error applies to the transaction, not any
        // sub-span.
        agent.captureError(err, { skipOutcome: true })
        trans.setOutcome(constants.OUTCOME_FAILURE)
        const bound = fail.bind(this, err)
        const finish = captureAndMakeCompleter(trans, payload, context, undefined, bound)
        finish()
      }
    })

    shimmer.wrap(context, 'done', (done) => {
      return wrapLambdaCallback(trans, payload, context, done)
    })
  }

  function captureAndMakeCompleter (trans, payload, context, result, boundCallback) {
    log.trace({ awsRequestId: context && context.awsRequestId }, 'lambda: fn end')
    captureContext(trans, payload, context, result)
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

  function wrapLambdaCallback (trans, payload, context, callback) {
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
      const finish = captureAndMakeCompleter(trans, payload, context, result, bound)
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

    return function wrappedLambda (payload, context, callback) {
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

      setLambdaTransactionData(transaction, event, context, isColdStart)

      // Wrap context and callback to finish and send transaction
      wrapContext(transaction, event, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(transaction, event, context, callback)
      }

      try {
        return fn.call(this, payload, context, callback)
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
