'use strict'

var agent = require('../../..').start({
  appName: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

// ws >2 doesn't support Node.js v0.x
var semver = require('semver')
var pkg = require('ws/package')
if (semver.lt(process.version, '1.0.0') && semver.gte(pkg.version, '2.0.0')) {
  process.exit()
}

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

// { transactions:
//    [ { transaction: 'foo',
//        result: undefined,
//        kind: 'websocket',
//        timestamp: '2017-01-13T13:44:00.000Z',
//        durations: [ 8.973545 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'foo',
//           signature: 'Send WebSocket Message',
//           kind: 'websocket.send',
//           transaction_kind: 'websocket',
//           timestamp: '2017-01-13T13:44:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'transaction',
//           kind: 'transaction',
//           transaction_kind: 'websocket',
//           timestamp: '2017-01-13T13:44:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw:
//       [ [ 8.973545,
//           [ 0, 1.216082, 7.105701 ],
//           [ 1, 0, 8.973545 ],
//           { extra: [Object] } ] ] } }
function done (t) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    t.equal(data.transactions[0].transaction, 'foo')
    t.equal(data.transactions[0].kind, 'websocket')

    t.equal(data.traces.groups.length, 2)

    t.equal(data.traces.groups[0].kind, 'websocket.send')
    t.equal(data.traces.groups[0].transaction_kind, 'websocket')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.equal(data.traces.groups[0].signature, 'Send WebSocket Message')
    t.equal(data.traces.groups[0].transaction, 'foo')

    t.equal(data.traces.groups[1].kind, 'transaction')
    t.equal(data.traces.groups[1].transaction_kind, 'websocket')
    t.deepEqual(data.traces.groups[1].parents, [])
    t.equal(data.traces.groups[1].signature, 'transaction')
    t.equal(data.traces.groups[1].transaction, 'foo')

    var totalTraces = data.traces.raw[0].length - 2
    var totalTime = data.traces.raw[0][0]

    t.equal(data.traces.raw.length, 1)
    t.equal(totalTraces, 2)

    for (var i = 1; i < totalTraces + 1; i++) {
      t.equal(data.traces.raw[0][i].length, 3)
      t.ok(data.traces.raw[0][i][0] >= 0, 'group index should be >= 0')
      t.ok(data.traces.raw[0][i][0] < data.traces.groups.length, 'group index should be within allowed range')
      t.ok(data.traces.raw[0][i][1] >= 0)
      t.ok(data.traces.raw[0][i][2] <= totalTime)
    }

    t.equal(data.traces.raw[0][totalTraces][1], 0, 'root trace should start at 0')
    t.equal(data.traces.raw[0][totalTraces][2], data.traces.raw[0][0], 'root trace should last to total time')

    t.deepEqual(data.transactions[0].durations, [data.traces.raw[0][0]])

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
