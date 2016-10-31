'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var Redis = require('ioredis')

test('not nested', function (t) {
  resetAgent(done(t))

  var redis = new Redis()

  agent.startTransaction('foo', 'bar', 'baz')

  var calls = 0

  redis.flushall(function (err, reply) {
    t.error(err)
    t.equal(reply, 'OK')
    calls++
  })

  redis.set('foo', 'bar')
  redis.get('foo', function (err, result) {
    t.error(err)
    t.equal(result, 'bar')
    calls++
  })

  redis.get('foo').then(function (result) {
    t.equal(result, 'bar')
    calls++
  })

  redis.sadd('set', 1, 3, 5, 7)
  redis.sadd('set', [1, 3, 5, 7])

  redis.set('key', 100, 'EX', 10)

  redis.keys('*', function testing123 (err, replies) {
    t.error(err)
    t.deepEqual(replies.sort(), ['foo', 'key', 'set'])
    t.equal(calls, 3)

    agent.endTransaction()
    redis.quit()
    agent._instrumentation._queue._flush()
  })
})

test('nested', function (t) {
  resetAgent(done(t))

  var redis = new Redis()

  agent.startTransaction('foo', 'bar', 'baz')

  redis.flushall(function (err, reply) {
    t.error(err)
    t.equal(reply, 'OK')
    var calls = 0

    redis.set('foo', 'bar')
    redis.get('foo', function (err, result) {
      t.error(err)
      t.equal(result, 'bar')
      calls++
    })

    redis.get('foo').then(function (result) {
      t.equal(result, 'bar')
      calls++
    })

    redis.sadd('set', 1, 3, 5, 7)
    redis.sadd('set', [1, 3, 5, 7])

    redis.set('key', 100, 'EX', 10)

    redis.keys('*', function testing123 (err, replies) {
      t.error(err)
      t.deepEqual(replies.sort(), ['foo', 'key', 'set'])
      t.equal(calls, 2)

      agent.endTransaction()
      redis.quit()
      agent._instrumentation._queue._flush()
    })
  })
})

// { transactions:
//    [ { transaction: 'foo',
//        result: 'baz',
//        kind: 'bar',
//        timestamp: '2016-07-29T09:58:00.000Z',
//        durations: [ 31.891944 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'foo',
//           signature: 'FLUSHALL',
//           kind: 'cache.redis',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'SET',
//           kind: 'cache.redis',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'GET',
//           kind: 'cache.redis',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'SADD',
//           kind: 'cache.redis',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'KEYS',
//           kind: 'cache.redis',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'transaction',
//           kind: 'transaction',
//           timestamp: '2016-07-29T09:58:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw:
//       [ [ 31.891944,
//           [ 0, 1.905168, 16.86911 ],
//           [ 1, 21.505805, 6.67724 ],
//           [ 2, 22.866657, 5.70388 ],
//           [ 2, 23.724921, 5.359812 ],
//           [ 3, 24.354847, 5.082269 ],
//           [ 3, 24.979798, 4.675697 ],
//           [ 1, 25.492804, 4.582025 ],
//           [ 4, 26.094776, 4.187654 ],
//           [ 5, 0, 31.891944 ] ] ] } }
function done (t) {
  return function (endpoint, headers, data, cb) {
    var groups = [
      'FLUSHALL',
      'SET',
      'GET',
      'SADD',
      'KEYS'
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
    t.equal(totalTraces, groups.length + 4) // +3 for double set, get and sadd commands, +1 for the root trace

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
