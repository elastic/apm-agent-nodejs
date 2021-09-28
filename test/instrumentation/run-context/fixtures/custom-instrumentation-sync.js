// An example creating custom spans via `apm.startSpan()` all in the same
// event loop task -- i.e. any active async-hook has no impact.
//
// Expect:
//   transaction "t1"
//   transaction "t2"
//   transaction "t3"
//   `- span "s4"
//     `- span "s5"

const apm = require('../../../../').start({ // elastic-apm-node
  captureExceptions: false,
  captureSpanStackTraces: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-simple'
})

let assert = require('assert')
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict
}

var t1 = apm.startTransaction('t1')
assert(apm._instrumentation.currTransaction() === t1)
var t2 = apm.startTransaction('t2')
assert(apm._instrumentation.currTransaction() === t2)
var t3 = apm.startTransaction('t3')
assert(apm._instrumentation.currTransaction() === t3)
var s4 = apm.startSpan('s4')
assert(apm._instrumentation.currSpan() === s4)
var s5 = apm.startSpan('s5')
assert(apm._instrumentation.currSpan() === s5)
s4.end() // (out of order)
assert(apm._instrumentation.currSpan() === s5)
s5.end()
assert(apm._instrumentation.currSpan() === null)
assert(apm._instrumentation.currTransaction() === t3)
t1.end() // (out of order)
assert(apm._instrumentation.currTransaction() === t3)
t3.end()
assert(apm._instrumentation.currTransaction() === null)
t2.end()
assert(apm._instrumentation.currTransaction() === null)
