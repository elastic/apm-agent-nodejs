'use strict'

const shimmer = require('./instrumentation/shimmer')

module.exports = function elasticApmAwsLambda (agent) {
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

    return function wrappedLambda (payload, context, callback) {
      let parentId
      if (payload.headers !== undefined) {
        for (const [key, value] of Object.entries(payload.headers)) {
          const lowerCaseKey = key.toLowerCase()
          if (lowerCaseKey === 'elastic-apm-traceparent') {
            parentId = value
            break
          } else if (lowerCaseKey === 'traceparent') {
            /**
             * We do not break here because we want to make sure to use
             * elastic-apm-traceparent if available.
             */
            parentId = value
          }
        }
      }
      const trans = agent.startTransaction(context.functionName, type, {
        childOf: parentId
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
