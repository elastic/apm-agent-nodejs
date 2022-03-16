'use strict'

var agent = require('../../..').start({
  serviceName: 'test-ioredis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false
})

var Redis = require('ioredis')
var test = require('tape')

var findObjInArray = require('../../_utils').findObjInArray
var mockClient = require('../../_mock_http_client')

test('not nested', function (t) {
  resetAgent(done(t))

  var redis = new Redis(process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

  var calls = 0

  redis.flushall(function (err, reply) {
    t.error(err)
    t.strictEqual(reply, 'OK')
    calls++
  })

  redis.set('foo', 'bar')
  redis.get('foo', function (err, result) {
    t.error(err)
    t.strictEqual(result, 'bar')
    calls++
  })

  redis.get('foo').then(function (result) {
    t.strictEqual(result, 'bar')
    calls++
  })

  redis.sadd('set', 1, 3, 5, 7)
  redis.sadd('set', [1, 3, 5, 7])

  redis.set('key', 100, 'EX', 10)

  redis.keys('*', function testing123 (err, replies) {
    t.error(err)
    t.deepEqual(replies.sort(), ['foo', 'key', 'set'])
    t.strictEqual(calls, 3)

    agent.endTransaction()
    redis.disconnect()
    agent.flush()
  })
})

test('nested', function (t) {
  resetAgent(done(t))

  var redis = new Redis(process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

  redis.flushall(function (err, reply) {
    t.error(err)
    t.strictEqual(reply, 'OK')
    var calls = 0

    redis.set('foo', 'bar')
    redis.get('foo', function (err, result) {
      t.error(err)
      t.strictEqual(result, 'bar')
      calls++
    })

    redis.get('foo').then(function (result) {
      t.strictEqual(result, 'bar')
      calls++
    })

    redis.sadd('set', 1, 3, 5, 7)
    redis.sadd('set', [1, 3, 5, 7])

    redis.set('key', 100, 'EX', 10)

    redis.keys('*', function testing123 (err, replies) {
      t.error(err)
      t.deepEqual(replies.sort(), ['foo', 'key', 'set'])
      t.strictEqual(calls, 2)

      agent.endTransaction()
      redis.disconnect()
      agent.flush()
    })
  })
})

test('error capture, no unhandledRejection on command error is introduced', function (t) {
  // Make sure there are no unhandled promise rejections
  // introduced by our promise handling. See #1518.
  let unhandledRejection = false
  function onUnhandledRejection (e) {
    unhandledRejection = true
  }
  process.once('unhandledRejection', onUnhandledRejection)
  t.on('end', () => {
    process.removeListener('unhandledRejection', onUnhandledRejection)
  })
  agent._instrumentation.testReset()
  agent._transport = mockClient(4, function (data) {
    const getSpan = findObjInArray(data.spans, 'name', 'GET')
    t.equal(data.errors.length, 1, 'captured 1 error')
    t.equal(data.errors[0].exception.type, 'ReplyError', 'exception.type')
    t.equal(data.errors[0].transaction_id, data.transactions[0].id, 'error.transaction_id')
    t.equal(data.errors[0].parent_id, getSpan.id, 'error.parent_id, the error is a child of the erroring span')

    setTimeout(function () {
      t.notOk(unhandledRejection)
      t.end()
    }, 0)
  })

  var redis = new Redis(process.env.REDIS_HOST)
  const trans = agent.startTransaction('foo', 'bar')
  redis.hset('a', 'b', 'c')
  redis.get('a', function (err, result) {
    t.ok(err)
    trans.end()
    redis.disconnect()
    agent.flush()
  }) // wrong type, should reject
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

    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, groups.length)

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'bar')
    t.strictEqual(trans.result, 'success')

    groups.forEach(function (name, i) {
      const span = data.spans[i]
      t.strictEqual(span.name, name, 'span.name')
      t.strictEqual(span.type, 'cache', 'span.type')
      t.strictEqual(span.subtype, 'redis', 'span.subtype')
      t.deepEqual(span.context.destination, {
        service: { name: 'redis', resource: 'redis', type: 'cache' },
        address: process.env.REDIS_HOST || 'localhost',
        port: 6379
      }, 'span.context.destination')
      t.strictEqual(span.parent_id, trans.id, 'span is a child of the transaction')
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(9, cb)
}
