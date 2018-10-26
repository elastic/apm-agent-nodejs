'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')

test('response writeHead is bound to transaction', function (t) {
  resetAgent((endpoint, headers, data, cb) => {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.result, 'HTTP 2xx', 'has correct result')

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
        agent.flush()
      })
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () { } }
  agent.captureError = function (err) { throw err }
}
