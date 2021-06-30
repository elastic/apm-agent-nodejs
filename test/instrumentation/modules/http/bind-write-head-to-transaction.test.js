'use strict'

var agent = require('../../_agent')()

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
    agent._instrumentation.currentTransaction = null
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
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
