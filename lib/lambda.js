'use strict'

const constants = require('./constants')
const shimmer = require('./instrumentation/shimmer')

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
        agent.logger.debug('XXX succeed called')
        const bound = succeed.bind(this, result)
        const done = captureAndMakeCompleter(trans, payload, context, result, bound)
        done()
      }
    })

    shimmer.wrap(context, 'fail', (fail) => {
      return function wrappedFail (err) {
        agent.logger.debug('XXX fail called')
        // Capture before trans.end() so it associates with the current trans.
        // `skipOutcome` to avoid setting outcome on a possible currentSpan,
        // because this error applies to the transaction, not any sub-span.
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

  function captureAndMakeCompleter (trans, payload, context, result, callback) {
    agent.logger.debug('XXX captureAndMakeCompleter: ending transaction')
    captureContext(trans, payload, context, result)
    trans.end()
    return () => {
      agent.logger.debug('XXX captureAndMakeCompleter: call agent.flush()')
      agent.flush((err) => {
        if (err) agent.logger.error('Flush error: %s', err.message)
        agent.logger.debug({ awsRequestId: context.awsRequestId }, 'lambda flush done, calling callback')
        callback()
      })
    }
  }

  function wrapLambdaCallback (trans, payload, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      agent.logger.debug('XXX  wrappedLambdaCallback called, _getActiveHandles: %d', process._getActiveHandles().length)
      if (err) {
        // Capture before trans.end() so it associates with the current trans.
        // `skipOutcome` to avoid setting outcome on a possible currentSpan,
        // because this error applies to the transaction, not any sub-span.
        console.warn('XXX3   calling captureError(%s) in wrappedLambdaCallback', err)
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

    return function wrappedLambda (payload, context, callback) {
      let parentId
      let tracestate
      if (payload.headers !== undefined) {
        const normalizedHeaders = {}
        for (const key of Object.keys(payload.headers)) {
          const value = payload.headers[key]
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

      // Wrap context and callback to finish and send transaction
      wrapContext(trans, payload, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(trans, payload, context, callback)
      }

      return fn.call(this, payload, context, callback)
    }
  }
}

function isLambdaExecutionEnviornment () {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

module.exports = {
  isLambdaExecutionEnviornment,
  elasticApmAwsLambda
}
