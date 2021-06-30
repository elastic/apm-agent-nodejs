'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
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
      t.strictEqual(message, 'ping')
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
    t.strictEqual(message, 'pong')
    wss.close(function () {
      agent.flush()
    })
  })
})

function done (t) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    var trans = data.transactions[0]
    var span = data.spans[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'websocket')
    t.strictEqual(span.name, 'Send WebSocket Message')
    t.strictEqual(span.type, 'websocket')
    t.strictEqual(span.subtype, 'send')

    var offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
