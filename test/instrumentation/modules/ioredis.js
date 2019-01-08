'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var Redis = require('ioredis')
var test = require('tape')

var mockClient = require('../../_mock_http_client')

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
    agent.flush()
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
      agent.flush()
    })
  })
})

function done (t) {
  return function (data, cb) {
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
    t.equal(data.spans.length, groups.length)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.equal(trans.result, 'success')

    groups.forEach(function (name, i) {
      t.equal(data.spans[i].name, name)
      t.equal(data.spans[i].type, 'cache')
      t.equal(data.spans[i].subtype, 'redis')
      t.notOk(data.spans[i].action)

      var offset = data.spans[i].timestamp - trans.timestamp
      t.ok(offset + data.spans[i].duration * 1000 < trans.duration * 1000)
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(9, cb)
  agent.captureError = function (err) { throw err }
}
