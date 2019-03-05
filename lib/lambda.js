'use strict'

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
    const succeed = wrapLambdaCallback(trans, payload, context, (_, res) => context.succeed(res))
    const done = wrapLambdaCallback(trans, payload, context, (err, res) => context.done(err, res))
    const fail = wrapLambdaCallback(trans, payload, context, (err) => context.fail(err))

    return Object.assign({}, context, {
      succeed: data => succeed(null, data),
      done: done,
      fail: fail
    })
  }

  function wrapLambdaCallback (trans, payload, context, callback) {
    return function wrappedLambdaCallback (err, result) {
      var self = this

      captureContext(trans, payload, context, result)
      trans.end()

      if (err) {
        agent.captureError(err, sendTransaction)
      } else {
        sendTransaction()
      }

      function sendTransaction () {
        agent.flush(done)
      }

      function done () {
        callback.call(self, err, result)
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
      context = wrapContext(trans, payload, context)
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
