'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var redis = require('redis')

// { transactions:
//    [ { transaction: 'foo',
//        result: 'baz',
//        kind: 'bar',
//        timestamp: '2016-07-28T17:57:00.000Z',
//        durations: [ 20.077148 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'foo',
//           signature: 'FLUSHALL',
//           kind: 'cache.redis',
//           timestamp: '2016-07-28T17:57:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'SET',
//           kind: 'cache.redis',
//           timestamp: '2016-07-28T17:57:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'HSET',
//           kind: 'cache.redis',
//           timestamp: '2016-07-28T17:57:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'HKEYS',
//           kind: 'cache.redis',
//           timestamp: '2016-07-28T17:57:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'transaction',
//           kind: 'transaction',
//           timestamp: '2016-07-28T17:57:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw:
//       [ [ 20.077148,
//           [ 0, 0.591359, 11.905252 ],
//           [ 1, 13.884884, 3.74471 ],
//           [ 2, 14.508829, 3.65903 ],
//           [ 2, 15.342503, 3.294208 ],
//           [ 3, 16.915787, 2.167231 ],
//           [ 4, 0, 20.077148 ] ] ] } }
test(function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var groups = [
      'FLUSHALL',
      'SET',
      'HSET',
      'HKEYS'
    ]

    t.equal(data.transactions.length, 1)
    t.equal(data.transactions[0].transaction, 'foo')
    t.equal(data.transactions[0].kind, 'bar')
    t.equal(data.transactions[0].result, 'baz')

    t.equal(data.traces.groups.length, groups.length + 1)

    groups.forEach(function (signature, i) {
      t.equal(data.traces.groups[i].kind, 'cache.redis')
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
    t.equal(totalTraces, groups.length + 3) // +1 for an extra hset command, +1 for the root trace, +1 for the callback-less SET

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

  var client = redis.createClient()

  agent.startTransaction('foo', 'bar', 'baz')

  client.flushall(function (err, reply) {
    t.error(err)
    t.equal(reply, 'OK')
    var done = 0

    client.set('string key', 'string val', function (err, reply) {
      t.error(err)
      t.equal(reply, 'OK')
      done++
    })

    // callback is optional
    client.set('string key', 'string val')

    client.hset('hash key', 'hashtest 1', 'some value', function (err, reply) {
      t.error(err)
      t.equal(reply, 1)
      done++
    })
    client.hset(['hash key', 'hashtest 2', 'some other value'], function (err, reply) {
      t.error(err)
      t.equal(reply, 1)
      done++
    })

    client.hkeys('hash key', function (err, replies) {
      t.error(err)
      t.equal(replies.length, 2)
      replies.forEach(function (reply, i) {
        t.equal(reply, 'hashtest ' + (i + 1))
      })
      t.equal(done, 3)

      agent.endTransaction()
      client.quit()
      agent._instrumentation._queue._flush()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
