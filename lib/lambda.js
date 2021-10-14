'use strict'

const shimmer = require('./instrumentation/shimmer')

process.prependListener('beforeExit', function () {
  console.warn('XXX [prependListener] beforeExit event (:wave: from agent/lambda.js)')
})

function elasticApmAwsLambda (agent) {
  function captureContext (trans, payload, context, result) {
    trans.setCustomContext({
      lambda: {
        // XXX Validate that we want to capture all these. Are these all from the spec?
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
        // XXX Do we really want to capture this?
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
        const bound = fail.bind(this, err)
        const done = captureAndMakeCompleter(trans, payload, context, undefined, bound)
        // XXX Don't pass 'done' to captureError, just call after. Rely on the
        //     agent.flush() in done to wait for the inflight error. Otherwise
        //     we doing *two* flushes. Have a test case for this.
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
        agent.logger.debug({ awsRequestId: context.awsRequestId }, 'lambda flush done, calling callback')
        callback()
      })
    }
  }

  function wrapLambdaCallback (trans, payload, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      agent.logger.debug('XXX wrappedLambdaCallback called, _getActiveHandles: %d', process._getActiveHandles().length)
      const bound = callback.bind(this, err, result)
      const done = captureAndMakeCompleter(trans, payload, context, result, bound)
      if (err) {
        // XXX Don't pass 'done' to captureError, just call after. Rely on the
        //     agent.flush() in done to wait for the inflight error. Otherwise
        //     we doing *two* flushes. Have a test case for this.
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

      // XXX I think we want to behave differently if this returns a Promise,
      //     and NOT call the callback... which is what triggers the beforeExit
      //     handling. What we have here is "fine" and still supports the old
      //     Lambda v1 `context.{done,fail,succeed}` but also *relies* on the
      //     internal Runtime impl calling these in a way that gets our
      //     wrapped versions.
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
