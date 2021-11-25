// Make an `http.request(...)` and assert expected run context in all the
// various callbacks and event handlers.

const apm = require('../../../../../').start({ // elastic-apm-node
  captureExceptions: false,
  captureSpanStackTraces: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-http-request'
})

let assert = require('assert')
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict
}
const http = require('http')

function makeARequest (url, opts, cb) {
  const clientReq = http.request(url, opts, function (clientRes) {
    console.log('client response: %s %s', clientRes.statusCode, clientRes.headers)
    assert(apm.currentSpan === null)
    apm.startSpan('span-in-http.request-callback').end()

    const chunks = []
    clientRes.on('data', function (chunk) {
      assert(apm.currentSpan === null)
      apm.startSpan('span-in-clientRes-on-data').end()
      chunks.push(chunk)
    })

    clientRes.on('end', function () {
      assert(apm.currentSpan === null)
      apm.startSpan('span-in-clientRes-on-end').end()
      const body = chunks.join('')
      console.log('client response body: %j', body)
      cb()
    })
  })

  assert(apm.currentSpan === null)
  apm.startSpan('span-sync-after-http.request').end()

  clientReq.on('socket', function () {
    assert(apm.currentSpan === null)
    apm.startSpan('span-in-clientReq-on-socket').end()
  })

  clientReq.on('response', function () {
    assert(apm.currentSpan === null)
    apm.startSpan('span-in-clientReq-on-response').end()
  })

  clientReq.on('finish', function () {
    assert(apm.currentSpan === null)
    apm.startSpan('span-in-clientReq-on-finish').end()
  })

  clientReq.end()
}

const t0 = apm.startTransaction('t0')
makeARequest(
  'http://httpstat.us/200',
  { headers: { accept: '*/*' } },
  function () {
    t0.end()
  })
