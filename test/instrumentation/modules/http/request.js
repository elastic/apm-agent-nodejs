'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')
var express = require('express')
var request = require('request')

test('request', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 2)

    var sub = data.transactions[0]
    t.equal(sub.name, 'GET /test')
    t.equal(sub.spans.length, 0)

    var root = data.transactions[1]
    t.equal(root.name, 'GET /')
    t.equal(root.spans.length, 1)
    t.equal(root.spans[0].name, 'GET localhost:' + server.address().port + '/test')

    server.close()
    t.end()
  })

  var app = express()
  var server = http.createServer(app)

  app.get('/test', (req, res) => {
    res.end('hello')
  })

  app.get('/', (req, res) => {
    request(`http://localhost:${req.socket.localPort}/test`).pipe(res)
  })

  sendRequest(server)
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb }
}

function sendRequest (server, timeout) {
  server.listen(function () {
    var port = server.address().port
    var req = http.get('http://localhost:' + port, function (res) {
      if (timeout) throw new Error('should not get to here')
      res.on('end', function () {
        agent.flush()
      })
      res.resume()
    })

    if (timeout) {
      req.on('error', function (err) {
        if (err.code !== 'ECONNRESET') throw err
        agent.flush()
      })

      process.nextTick(function () {
        req.abort()
      })
    }
  })
}
