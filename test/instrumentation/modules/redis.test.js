/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const redisVersion = require('redis/package.json').version
const semver = require('semver')

if (semver.lt(redisVersion, '4.0.0')) {
  console.log('# SKIP: skipping redis.test.js tests <4.0.0')
  process.exit(0)
}

const agent = require('../../..').start({
  serviceName: 'test-redis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false
})

const redis = require('redis')
const test = require('tape')

const findObjInArray = require('../../_utils').findObjInArray
const mockClient = require('../../_mock_http_client')

test('redis', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 2, 'have 2 transactions')

    // We expect a 'transBeforeClient' transaction, and we want to ensure it
    // does *not* have spans for each of the client commands. It *possibly*
    // (with contextManager="patch" it doesn't) has an "INFO" span for the
    // internal INFO command the RedisClient setup does.
    let trans = findObjInArray(data.transactions, 'name', 'transBeforeClient')
    t.ok(trans, 'have "transBeforeClient" transaction')
    let spans = data.spans.filter(s => s.transaction_id === trans.id)
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

    const expectedSpanNames = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS'
    ]
    t.equal(spans.length, expectedSpanNames.length, 'have the expected number of spans')
    for (let i = 0; i < expectedSpanNames.length; i++) {
      const expectedName = expectedSpanNames[i]
      const span = spans[i]
      if (span) {
        t.strictEqual(span.transaction_id, trans.id, 'span.transaction_id')
        t.strictEqual(span.name, expectedName, 'span.name')
        t.strictEqual(span.type, 'db', 'span.type')
        t.strictEqual(span.subtype, 'redis', 'span.subtype')
        t.deepEqual(span.context.destination, {
          address: process.env.REDIS_HOST || 'localhost',
          port: 6379,
          service: { name: '', type: '', resource: 'redis' }
        }, 'span.context.destination')
        t.deepEqual(span.context.db, { type: 'redis' }, 'span.context.db')
        t.strictEqual(span.parent_id, trans.id, 'span is a child of the transaction')

        const offset = span.timestamp - trans.timestamp
        t.ok(offset + span.duration * 1000 < trans.duration * 1000,
          'span ended before transaction ended')
      } else {
        t.fail('no spans generated')
      }
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
  const transBeforeClient = agent.startTransaction('transBeforeClient')

  const client = redis.createClient({
    socket: {
      port: '6379',
      host: process.env.REDIS_HOST
    }
  })
  client.connect()

  const transAfterClient = agent.startTransaction('transAfterClient')

  client.flushAll().then(function (reply) {
    t.strictEqual(reply, 'OK', 'reply is OK')
    let done = 0

    client.set('string key', 'string val').then(function (reply) {
      t.strictEqual(reply, 'OK', 'reply is OK')
      done++
    }).catch(function (err) {
      t.error(err)
    })

    // callback is optional
    client.set('string key', 'string val')

    client.hSet('hash key', 'hashtest 1', 'some value').then(function (reply) {
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    }).catch(function (err) {
      t.error(err, 'no hset error')
    })

    // TODO: other signatures?
    client.hSet('hash key', ['hashtest 2', 'some other value']).then(function (reply) {
    // client.hSet('hash key', 'hashtest 2', 'some other value').then(function (reply) {
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    }).catch(function (err) {
      t.error(err, 'no hset error')
    })

    client.hKeys('hash key').then(function (replies) {
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
    }).catch(function (err) {
      t.error(err, 'no hkeys error')
    })
  }).catch(function (err) {
    t.error(err, 'no flushall error')
  })
})

if (semver.satisfies(redisVersion, '<=2.4.2')) {
  // Redis <=2.4.2 allowed a callback as the last item in an args array.
  // Support for this was dropped in commit 60eee34de1.
  test('client.cmd([args..., myCb]) call signature', function (t) {
    let nCbCalled = 0
    function myCb () {
      nCbCalled++
    }

    resetAgent(function (data) {
      t.equal(nCbCalled, 1, 'myCb was called the expected number of times')
      t.equal(data.transactions.length, 1, 'got 1 transaction')
      t.equal(data.spans.length, 1, 'got 1 span')
      t.equal(data.spans[0].name, 'GET', 'span name is GET')
      t.end()
    })

    const client = redis.createClient({
      socket: {
        port: '6379',
        host: process.env.REDIS_HOST
      }
    })

    client.on('ready', function () {
      const t0 = agent.startTransaction('t0')

      client.get(['k', myCb])

      t0.end()
      client.quit()
      agent.flush()
    })
  })
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(cb)
}
