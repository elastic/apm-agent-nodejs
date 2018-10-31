'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')
var express = require('express')
var request = require('request')

var mockClient = require('../../../_mock_http_client')
var findObjInArray = require('../../../_utils').findObjInArray

test('request', function (t) {
  resetAgent(function (data) {
    t.equal(data.transactions.length, 2)
    t.equal(data.spans.length, 1)

    var sub = data.transactions[0]
    t.equal(sub.name, 'GET /test')

    var root = data.transactions[1]
    t.equal(root.name, 'GET /')
    const span = findObjInArray(data.spans, 'transactionId', root.id)
    t.equal(span.name, 'GET localhost:' + server.address().port + '/test')

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
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(3, cb)
}

function sendRequest (server, timeout) {
  server.listen(function () {
    var port = server.address().port
    var req = http.get('http://localhost:' + port, function (res) {
      if (timeout) throw new Error('should not get to here')
      res.resume()
    })

    if (timeout) {
      process.nextTick(function () {
        req.abort()
      })
    }
  })
}
