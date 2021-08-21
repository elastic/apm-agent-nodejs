// Expect:
//     transaction "ls"
//     `- span "cwd"
//     `- span "readdir"

var apm = require('../../../').start({ // elastic-apm-node
  captureExceptions: false,
  captureSpanStackTraces: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'ls-promises'
})

const assert = require('assert').strict
const fsp = require('fs').promises

let t1

function getCwd () {
  var s2 = apm.startSpan('cwd')
  try {
    return Promise.resolve(process.cwd())
  } finally {
    assert(apm.currentTransaction === t1)
    assert(apm.currentSpan === s2)
    s2.end()
  }
}

function main () {
  t1 = apm.startTransaction('ls')
  assert(apm.currentTransaction === t1)
  getCwd()
    .then(cwd => {
      assert(apm.currentTransaction === t1)
      assert(apm.currentSpan === null)
      var s3 = apm.startSpan('readdir')
      assert(apm.currentSpan === s3)
      return fsp.readdir(cwd)
        .finally(() => {
          assert(apm.currentSpan === s3)
          s3.end()
        })
    })
    .then(entries => {
      assert(apm.currentTransaction === t1)
      assert(apm.currentSpan === null)
      console.log('entries:', entries)
    })
    .finally(() => {
      assert(apm.currentTransaction === t1)
      t1.end()
    })
}

main()
