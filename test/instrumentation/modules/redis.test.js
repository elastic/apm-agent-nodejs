'use strict'

var agent = require('../../..').start({
  serviceName: 'test-redis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var redis = require('redis')
var test = require('tape')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

test('redis', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 2, 'have 2 transactions')

    // We expect a 'transBeforeClient' transaction, and we want to ensure it
    // does *not* have spans for each of the client commands. It *possibly*
    // (with asyncHooks=false it doesn't) has an "INFO" span for the internal
    // INFO command the RedisClient setup does.
    var trans = findObjInArray(data.transactions, 'name', 'transBeforeClient')
    t.ok(trans, 'have "transBeforeClient" transaction')
    var spans = data.spans.filter(s => s.transaction_id === trans.id)
      .filter(s => s.name !== 'INFO')
    t.equal(spans.length, 0, 'there are no non-INFO spans in the "transBeforeClient" transaction')

    // Sort the remaining spans by timestamp, because asynchronous-span.end()
    // means they can be set to APM server out of order.
    spans = data.spans
      .filter(s => s.transaction_id !== trans.id)
      .sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    trans = findObjInArray(data.transactions, 'name', 'transAfterClient')
    t.ok(trans, 'have "transAfterClient" transaction')
    t.strictEqual(trans.result, 'success', 'trans.result')

    var expectedSpanNames = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS'
    ]
    t.equal(spans.length, expectedSpanNames.length, 'have the expected number of spans')
    for (var i = 0; i < expectedSpanNames.length; i++) {
      const expectedName = expectedSpanNames[i]
      const span = spans[i]
      t.strictEqual(span.transaction_id, trans.id, 'span.transaction_id')
      t.strictEqual(span.name, expectedName, 'span.name')
      t.strictEqual(span.type, 'cache', 'span.type')
      t.strictEqual(span.subtype, 'redis', 'span.subtype')
      t.deepEqual(span.context.destination, {
        service: { name: 'redis', resource: 'redis', type: 'cache' },
        address: process.env.REDIS_HOST || '127.0.0.1',
        port: 6379
      }, 'span.context.destination')

      var offset = span.timestamp - trans.timestamp
      t.ok(offset + span.duration * 1000 < trans.duration * 1000,
        'span ended before transaction ended')
    }

    t.end()
  })

  // If a redis client is not yet "ready" it will queue client commands, and
  // then send them after "ready". Internally this results in calling
  // RedisClient.internal_send_command *twice* for each queued command. If the
  // instrumentation isn't careful, it is easy to instrument both of those
  // calls. The latter call will only result in a span if there is a
  // currentTransaction for the async task in which the redis client is created.
  // That's what `transBeforeClient` is: to make sure we *don't* get
  // double-spans.
  var transBeforeClient = agent.startTransaction('transBeforeClient')

  var client = redis.createClient('6379', process.env.REDIS_HOST)

  var transAfterClient = agent.startTransaction('transAfterClient')

  client.flushall(function (err, reply) {
    t.error(err, 'no flushall error')
    t.strictEqual(reply, 'OK', 'reply is OK')
    var done = 0

    client.set('string key', 'string val', function (err, reply) {
      t.error(err)
      t.strictEqual(reply, 'OK', 'reply is OK')
      done++
    })

    // callback is optional
    client.set('string key', 'string val')

    client.hset('hash key', 'hashtest 1', 'some value', function (err, reply) {
      t.error(err, 'no hset error')
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    })
    client.hset(['hash key', 'hashtest 2', 'some other value'], function (err, reply) {
      t.error(err, 'no hset error')
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    })

    client.hkeys('hash key', function (err, replies) {
      t.error(err, 'no hkeys error')
      t.strictEqual(replies.length, 2, 'got two replies')
      replies.forEach(function (reply, i) {
        t.strictEqual(reply, 'hashtest ' + (i + 1), `reply ${i} value`)
      })
      done++
      t.strictEqual(done, 4, 'done 4 callbacks')

      transAfterClient.end()
      transBeforeClient.end()
      client.quit()
      agent.flush()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
