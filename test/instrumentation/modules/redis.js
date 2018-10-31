'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var redis = require('redis')
var test = require('tape')

var mockClient = require('../../_mock_http_client')

test(function (t) {
  resetAgent(function (data) {
    var groups = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS'
    ]

    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, groups.length)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.equal(trans.result, 'success')

    groups.forEach(function (name, i) {
      t.equal(data.spans[i].name, name)
      t.equal(data.spans[i].type, 'cache.redis')
      t.ok(data.spans[i].start + data.spans[i].duration < trans.duration)
    })

    t.end()
  })

  var client = redis.createClient('6379', process.env.REDIS_HOST)

  agent.startTransaction('foo', 'bar')

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
      agent.flush()
    })
  })
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(7, cb)
  agent.captureError = function (err) { throw err }
}
