'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var Server = require('mongodb-core').Server

// { transactions:
//    [ { transaction: 'foo',
//        result: undefined,
//        kind: 'bar',
//        timestamp: '2016-07-15T13:39:00.000Z',
//        durations: [ 3.287613 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'foo',
//           signature: 'system.$cmd.ismaster',
//           kind: 'db.mongodb.query',
//           timestamp: '2016-07-15T13:39:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'transaction',
//           kind: 'transaction',
//           timestamp: '2016-07-15T13:39:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw: [ [ 3.287613, [ 0, 0.60478, 1.661918 ], [ 1, 0, 3.287613 ] ] ] } }
test('trace simple command', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var groups = [
      'system.$cmd.ismaster',
      // 'opbeat.$cmd.command', // only appears in mongodb-core 1.x
      'opbeat.test.insert',
      'opbeat.test.update',
      'opbeat.test.remove',
      'opbeat.test.find'
    ]

    t.equal(data.transactions.length, 1)
    t.equal(data.transactions[0].transaction, 'foo')
    t.equal(data.transactions[0].kind, 'bar')
    t.equal(data.transactions[0].result, 'baz')

    t.equal(data.traces.groups.length, groups.length + 1)

    groups.forEach(function (signature, i) {
      t.equal(data.traces.groups[i].kind, 'db.mongodb.query')
      t.deepEqual(data.traces.groups[i].parents, ['transaction'])
      t.equal(data.traces.groups[i].signature, signature)
      t.equal(data.traces.groups[i].transaction, 'foo')
    })

    t.equal(data.traces.groups[groups.length].kind, 'transaction')
    t.deepEqual(data.traces.groups[groups.length].parents, [])
    t.equal(data.traces.groups[groups.length].signature, 'transaction')
    t.equal(data.traces.groups[groups.length].transaction, 'foo')

    var totalTraces = data.traces.raw[0].length - 1
    var totalTime = data.traces.raw[0][0]

    t.equal(data.traces.raw.length, 1)
    t.equal(totalTraces, groups.length + 2) // +1 for an extra ismaster command, +1 for the root trace

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
  })

  var server = new Server({})

  agent.startTransaction('foo', 'bar', 'baz')

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.on('connect', function (_server) {
    _server.command('system.$cmd', {ismaster: true}, function (err, results) {
      t.error(err)
      t.equal(results.result.ismaster, true)

      _server.insert('opbeat.test', [{a: 1}, {a: 2}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
        t.error(err)
        t.equal(results.result.n, 2)

        _server.update('opbeat.test', [{q: {a: 1}, u: {'$set': {b: 1}}}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
          t.error(err)
          t.equal(results.result.n, 1)

          _server.remove('opbeat.test', [{q: {a: 1}, limit: 1}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
            t.error(err)
            t.equal(results.result.n, 1)

            var cursor = _server.cursor('opbeat.test', {find: 'opbeat.test', query: {a: 2}})

            cursor.next(function (err, doc) {
              t.error(err)
              t.equal(doc.a, 2)

              _server.command('system.$cmd', {ismaster: true}, function (err, result) {
                t.error(err)
                agent.endTransaction()
                _server.destroy()
                agent._instrumentation._queue._flush()
              })
            })
          })
        })
      })
    })
  })

  server.connect()
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
