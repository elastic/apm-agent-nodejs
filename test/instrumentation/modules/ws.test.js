/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../..').start({
  serviceName: 'test-ws',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const test = require('tape')
const WebSocket = require('ws')

const mockClient = require('../../_mock_http_client')

const PORT = 12342

test('ws.send', function (t) {
  resetAgent(done(t))

  const wss = new WebSocket.Server({ port: PORT })

  wss.on('connection', function (ws) {
    ws.on('message', function (message) {
      t.strictEqual(message, 'ping')
      ws.send('pong')
    })
  })

  const ws = new WebSocket('ws://localhost:' + PORT)

  ws.on('open', function () {
    agent.startTransaction('foo', 'websocket')
    ws.send('ping', function () {
      t.ok(agent.currentSpan === null, 'websocket span should not be the currentSpan in user callback')
      agent.endTransaction()
    })
    t.ok(agent.currentSpan === null, 'websocket span should not spill into user code')
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

    const trans = data.transactions[0]
    const span = data.spans[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'websocket')
    t.strictEqual(span.name, 'Send WebSocket Message')
    t.strictEqual(span.type, 'websocket')
    t.strictEqual(span.subtype, 'send')

    const offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
