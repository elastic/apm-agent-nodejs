'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var WebSocket = require('ws')

var mockClient = require('../../_mock_http_client')

var PORT = 12342

test('ws.send', function (t) {
  resetAgent(done(t))

  var wss = new WebSocket.Server({ port: PORT })

  wss.on('connection', function (ws) {
    ws.on('message', function (message) {
      t.equal(message, 'ping')
      ws.send('pong')
    })
  })

  var ws = new WebSocket('ws://localhost:' + PORT)

  ws.on('open', function () {
    agent.startTransaction('foo', 'websocket')
    ws.send('ping', function () {
      agent.endTransaction()
    })
  })

  ws.on('message', function (message) {
    t.equal(message, 'pong')
    wss.close(function () {
      agent.flush()
    })
  })
})

function done (t) {
  return function (data, cb) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 1)

    var trans = data.transactions[0]
    var span = data.spans[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'websocket')
    t.equal(span.name, 'Send WebSocket Message')
    t.equal(span.type, 'websocket')
    t.equal(span.subtype, 'send')
    t.notOk(span.action)

    var offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(2, cb)
  agent.captureError = function (err) { throw err }
}
