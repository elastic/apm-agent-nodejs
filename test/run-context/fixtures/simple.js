// Expect:
//   transaction "t1"
//   `- span "s2"

const apm = require('../../../').start({ // elastic-apm-node
  captureExceptions: false,
  captureSpanStackTraces: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-simple'
})

const assert = require('assert').strict

setImmediate(function () {
  const t1 = apm.startTransaction('t1')
  assert(apm.currentTransaction === t1)

  setImmediate(function () {
    const s2 = apm.startSpan('s2')
    assert(apm.currentSpan === s2)

    setImmediate(function () {
      assert(apm.currentSpan === s2)
      s2.end()
      assert(apm.currentSpan === null)
      t1.end()
      assert(apm.currentTransaction === null)
      const s3 = apm.startSpan('s3')
      assert(s3 === null, 's3 is null because there is no current transaction')
    })

    assert(apm.currentSpan === s2)
  })
})
