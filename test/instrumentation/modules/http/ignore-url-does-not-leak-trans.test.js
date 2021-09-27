'use strict'

// Test that the run context inside the HTTP server request handler is nulled
// out when the request path is ignored via "ignoreUrlStr" or the other
// related configuration options.

const { CapturingTransport } = require('../../../_capturing_transport')

const apm = require('../../../..').start({
  serviceName: 'test-http-ignore-url-does-not-leak-trans',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanFramesMinDuration: -1, // always capture stack traces with spans

  ignoreUrlStr: ['/ignore-this-path'],
  transport () {
    return new CapturingTransport()
  }
})

var http = require('http')
var test = require('tape')

test('an ignored incoming http URL does not leak previous transaction', function (t) {
  // Start an outer transaction that should not "leak" into the server handler
  // for ignored URLs.
  var prevTrans = apm.startTransaction('prevTrans')

  var server = http.createServer(function (req, res) {
    t.equal(apm.currentTransaction, null, 'current transaction in ignored URL handler is null')
    const span = apm.startSpan('aSpan')
    t.ok(span === null, 'no spans are created in ignored URL handler')
    if (span) {
      span.end()
    }
    res.end()
  })

  server.listen(function () {
    var opts = {
      port: server.address().port,
      path: '/ignore-this-path'
    }
    const req = http.request(opts, function (res) {
      res.on('end', function () {
        server.close()
        prevTrans.end()
        // Wait long enough for the span to encode and be sent to transport.
        setTimeout(function () {
          t.equal(apm._transport.transactions.length, 1)
          t.equal(apm._transport.spans.length, 1, 'only have the span for the http *request*')
          t.end()
        }, 500) // 200ms was not long enough in CI.
      })
      res.resume()
    })
    req.end()
  })
})
