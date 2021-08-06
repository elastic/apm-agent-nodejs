// vim: set ts=2 sw=2:

var apm = require('./').start({ // elastic-apm-node
  serviceName: 'parent-child',
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  apiRequestTime: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // XXX
  // disableSend: true
})

const express = require('express')

const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.end('pong')
})

app.get('/a', (req, res) => {
  var s1 = apm.startSpan('s1')
  setTimeout(function () {
    var s2 = apm.startSpan('s2')
    setTimeout(function () {
      var s3 = apm.startSpan('s3')
      setTimeout(function () {
        s3.end()
        s2.end()
        s1.end()
        res.send('done')
      }, 10)
    }, 10)
  }, 10)
})

setTimeout(function () {
  console.warn('XXX in unrelated 3s timeout: currTx is: ', apm._instrumentation.currTx())
}, 3000)

app.get('/b', (req, res) => {
  var s1 = apm.startSpan('s1')
  s1.end()
  var s2 = apm.startSpan('s2')
  s2.end()
  var s3 = apm.startSpan('s3')
  s3.end()
  res.send('done')
})

// Note: This is one case where the current agent gets it wrong from what we want.
// We want:
//   transaction "GET /c"
//   `- span "s1"
//     `- span "s2"
//       `- span "s3"
// but we get all siblings.
app.get('/c', (req, res) => {
  var s1 = apm.startSpan('s1')
  var s2 = apm.startSpan('s2')
  var s3 = apm.startSpan('s3')
  s3.end()
  s2.end()
  s1.end()
  res.send('done')
})

function one () {
  var s1 = apm.startSpan('s1')
  two()
  s1.end()
}
function two () {
  var s2 = apm.startSpan('s2')
  three()
  s2.end()
}
function three () {
  var s3 = apm.startSpan('s3')
  s3.end()
}
app.get('/d', (req, res) => {
  one()
  res.send('done')
})

// 'e' (the simplified ES client example from
// https://gist.github.com/trentm/63e5dbdeded8b568e782d1f24eab9536) is elided
// here because it is functionally equiv to 'c' and 'd'.

// Note: This is another case where the current agent gets it wrong from what we
// want.  We want:
//   transaction "GET /f"
//   `- span "s1"
//   `- span "s2" (because s1 has *ended* before s2 starts)
// but we get:
//   transaction "GET /f"
//   `- span "s1"
//     `- span "s2"
app.get('/f', (req, res) => { // '/nspans-dario'
  var s1 = apm.startSpan('s1')
  process.nextTick(function () {
    s1.end()
    var s2 = apm.startSpan('s2')
    s2.end()
    res.end('done')
  })
})

app.get('/unended-span', (req, res) => {
  var s1 = apm.startSpan('this is span 1')
  res.end('done')
})

// https://github.com/elastic/apm-agent-nodejs/pull/1963
// without patch:
//   transaction
//     ES span
//     HTTP span
//       a-sibling-span
//
// with patch:
//   transaction
//     ES span
//       HTTP span
//         a-sibling-span
//
// Perhaps this is fine?
app.get('/dario-1963', (req, res) => {
  client.search({
    index: 'kibana_sample_data_logs',
    body: { size: 1, query: { match_all: {} } }
  }, (err, _result) => {
    if (err) {
      res.send(err)
    } else {
      res.send('ok')
    }
  })

  // What if I add this?
  setImmediate(function () {
    var span = apm.startSpan('a-sibling-span')
    setImmediate(function () {
      span.end()
    })
  })
})

app.listen(port, function () {
  console.log(`listening at http://localhost:${port}`)
})
