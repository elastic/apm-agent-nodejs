'use strict'

const shimmer = require('./instrumentation/shimmer')

module.exports = function elasticApmAwsLambda (agent) {
  function sendTransactionFn (trans) {
    return () => {
      trans.end()
      // NOTE: Just resolve so result does not fail the lambda
      return new Promise(resolve => agent.flush(resolve))
    }
  }

  function passFn (trans, payload, context) {
    const sendTransaction = sendTransactionFn(trans)
    return result => {
      captureContext(trans, payload, context, result)
      return sendTransaction().then(() => result)
    }
  }

  function failFn (trans, payload, context) {
    return error => {
      captureContext(trans, payload, context)
      return captureError(error)
        .then(sendTransactionFn(trans))
        .then(() => Promise.reject(error))
    }
  }

  function captureError (error) {
    // NOTE: Just resolve so result does not fail the lambda
    return new Promise(resolve => agent.captureError(error, resolve))
  }

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
        var bound = succeed.bind(this, result)
        var done = captureAndMakeCompleter(trans, payload, context, result, bound)
        done()
      }
    })

    shimmer.wrap(context, 'fail', (fail) => {
      return function wrappedSucceed (err) {
        var bound = fail.bind(this, err)
        var done = captureAndMakeCompleter(trans, payload, context, undefined, bound)
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
      agent.flush(callback)
    }
  }

  function wrapLambdaCallback (trans, payload, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      var bound = callback.bind(this, err, result)
      var done = captureAndMakeCompleter(trans, payload, context, result, bound)
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
        parentId = payload.headers['elastic-apm-traceparent']
      }
      const trans = agent.startTransaction(context.functionName, type, {
        childOf: parentId
      })

      // Wrap context and callback to finish and send transaction
      wrapContext(trans, payload, context)
      if (typeof callback === 'function') {
        callback = wrapLambdaCallback(trans, payload, context, callback)
      }

      const result = fn.call(this, payload, context, callback)

      return result && typeof result.then === 'function'
        ? result.then(
          passFn(trans, payload, context),
          failFn(trans, payload, context)
        )
        : result
    }
  }
}
