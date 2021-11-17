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

test('redis', function (t) {
  resetAgent(function (data) {
    var groups = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS'
    ]

    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, groups.length)

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'foo', 'trans.name')
    t.strictEqual(trans.type, 'bar', 'trans.type')
    t.strictEqual(trans.result, 'success', 'trans.result')

    // Sort by timestamp, because asynchronous-span.end() means they can be
    // set to APM server out of order.
    data.spans.sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    for (var i = 0; i < groups.length; i++) {
      const name = groups[i]
      const span = data.spans[i]
      t.strictEqual(span.name, name, 'span.name')
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

  var client = redis.createClient('6379', process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

  client.flushall(function (err, reply) {
    t.error(err)
    t.strictEqual(reply, 'OK')
    var done = 0

    client.set('string key', 'string val', function (err, reply) {
      t.error(err)
      t.strictEqual(reply, 'OK')
      done++
    })

    // callback is optional
    client.set('string key', 'string val')

    client.hset('hash key', 'hashtest 1', 'some value', function (err, reply) {
      t.error(err)
      t.strictEqual(reply, 1)
      done++
    })
    client.hset(['hash key', 'hashtest 2', 'some other value'], function (err, reply) {
      t.error(err)
      t.strictEqual(reply, 1)
      done++
    })

    client.hkeys('hash key', function (err, replies) {
      t.error(err)
      t.strictEqual(replies.length, 2)
      replies.forEach(function (reply, i) {
        t.strictEqual(reply, 'hashtest ' + (i + 1))
      })
      t.strictEqual(done, 3)

      agent.endTransaction()
      client.quit()
      agent.flush()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(7, cb)
  agent.captureError = function (err) { throw err }
}
