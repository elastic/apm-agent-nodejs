'use strict'

var agent = require('../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var redis = require('redis')

test(function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var groups = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS'
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
