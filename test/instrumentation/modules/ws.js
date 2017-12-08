'use strict'

var agent = require('../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var PORT = 12342

var test = require('tape')
var WebSocket = require('ws')

test('ws.send', function (t) {
  resetAgent(done(t))

  var wss = new WebSocket.Server({port: PORT})

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
      agent._instrumentation._queue._flush()
    })
  })
})

function done (t) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'websocket')
    t.equal(trans.spans.length, 1)
    t.equal(trans.spans[0].name, 'Send WebSocket Message')
    t.equal(trans.spans[0].type, 'websocket.send')
    t.ok(trans.spans[0].start + trans.spans[0].duration < trans.duration)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
