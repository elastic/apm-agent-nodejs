var apm = require('../../../').start({ // elastic-apm-node
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  apiRequestTime: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-simple'
})
const assert = require('assert').strict

setImmediate(function () {
  var t1 = apm.startTransaction('t1')
  setImmediate(function () {
    var s2 = apm.startSpan('s2')
    assert(apm._instrumentation.currSpan() === s2)
    setImmediate(function () {
      assert(apm._instrumentation.currSpan() === s2)
      s2.end()
      assert(apm._instrumentation.currSpan() === null)
      t1.end()
      assert(apm._instrumentation.currTx() === null)
      var s3 = apm.startSpan('s3')
      assert(s3 === null, 's3 is null because there is no current transaction')
    })
    assert(apm._instrumentation.currSpan() === s2)
  })
})
