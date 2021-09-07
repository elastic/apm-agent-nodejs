// An example creating custom spans via `apm.startSpan()` all in the same
// event loop task -- i.e. any active async-hook has no impact.
//
// Run the following to see instrumentation debug output:
//    ELASTIC_APM_LOG_LEVEL=trace node examples/custom-spans-async-1.js \
//      | ecslog  -k 'event.module: "instrumentation"' -x event.module -l debug
//
// XXX This is more for testing than as a useful example for end users. Perhaps
// move to test/...
/* eslint-disable no-multi-spaces */

var apm = require('../').start({ // elastic-apm-node
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  apiRequestTime: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'custom-spans-async-1'
  // XXX want to test with and without this:
  // asyncHooks: false
})
const assert = require('assert').strict

setImmediate(function () {
  var t1 = apm.startTransaction('t1')
  assert(apm._instrumentation.currTx() === t1)
  setImmediate(function () {
    assert(apm._instrumentation.currTx() === t1)
    // XXX add more asserts on ctxmgr state
    var s2 = apm.startSpan('s2')
    setImmediate(function () {
      var s3 = apm.startSpan('s3')
      setImmediate(function () {
        s3.end()
        var s4 = apm.startSpan('s4')
        s4.end()
        s2.end()
        t1.end()
        // assert currTx=null
      })
    })
  })

  var t5 = apm.startTransaction('t5')
  setImmediate(function () {
    var s6 = apm.startSpan('s6')
    setTimeout(function () {
      s6.end()
      setImmediate(function () {
        t5.end()
      })
    }, 10)
  })
})

process.on('exit', function () {
  console.warn('XXX exiting. ctxmgr still holds these run contexts: ', apm._instrumentation._runCtxMgr._contexts)
})

// Expect:
//   transaction "t1"
//   `- span "s2"
//    `- span "s3"
//    `- span "s4"
//   transaction "t5"
//   `- span "s6"
