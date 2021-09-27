'use strict'

const agent = require('../../../..').start({
  serviceName: 'test-http-outgoing',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanFramesMinDuration: -1 // always capture stack traces with spans
})

var http = require('http')

var test = require('tape')

var mockClient = require('../../../_mock_http_client')

test('response writeHead is bound to transaction', function (t) {
  resetAgent(data => {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.result, 'HTTP 2xx', 'has correct result')

    t.end()
  })

  var server = http.createServer(function (req, res) {
    agent._instrumentation.enterEmptyRunContext()
    res.end()
  })

  server.listen(function () {
    var port = server.address().port
    http.get(`http://localhost:${port}`, function (res) {
      res.resume()
      res.on('end', () => {
        server.close()
      })
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
