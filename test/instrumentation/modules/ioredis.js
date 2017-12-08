'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var Redis = require('ioredis')

test('not nested', function (t) {
  resetAgent(done(t))

  var redis = new Redis(process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

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

  var redis = new Redis(process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

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

function done (t) {
  return function (endpoint, headers, data, cb) {
    var groups = [
      'FLUSHALL',
      'SET',
      'GET',
      'GET',
      'SADD',
      'SADD',
      'SET',
      'KEYS'
    ]

    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.equal(trans.result, 'success')

    t.equal(trans.spans.length, groups.length)

    groups.forEach(function (name, i) {
      t.equal(trans.spans[i].name, name)
      t.equal(trans.spans[i].type, 'cache.redis')
      t.ok(trans.spans[i].start + trans.spans[i].duration < trans.duration)
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
