/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var agent = require('../../..').start({
  serviceName: 'test-redis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false
})

var redis = require('redis')
var redisVersion = require('redis/package.json').version
var semver = require('semver')
var test = require('tape')

var findObjInArray = require('../../_utils').findObjInArray
var mockClient = require('../../_mock_http_client')

test('redis', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 2, 'have 2 transactions')

    // We expect a 'transBeforeClient' transaction, and we want to ensure it
    // does *not* have spans for each of the client commands. It *possibly*
    // (with contextManager="patch" it doesn't) has an "INFO" span for the
    // internal INFO command the RedisClient setup does.
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
      if(span) {
        t.strictEqual(span.transaction_id, trans.id, 'span.transaction_id')
        t.strictEqual(span.name, expectedName, 'span.name')
        t.strictEqual(span.type, 'cache', 'span.type')
        t.strictEqual(span.subtype, 'redis', 'span.subtype')
        t.deepEqual(span.context.destination, {
          service: { name: 'redis', resource: 'redis', type: 'cache' },
          address: process.env.REDIS_HOST || '127.0.0.1',
          port: 6379
        }, 'span.context.destination')
        t.strictEqual(span.parent_id, trans.id, 'span is a child of the transaction')

        var offset = span.timestamp - trans.timestamp
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
  var transBeforeClient = agent.startTransaction('transBeforeClient')

  var client = redis.createClient('6379', process.env.REDIS_HOST)
  client.connect()

  var transAfterClient = agent.startTransaction('transAfterClient')


  client.flushAll().then(function (reply) {
    t.strictEqual(reply, 'OK', 'reply is OK')
    var done = 0

    client.set('string key', 'string val').then(function (reply) {
      t.strictEqual(reply, 'OK', 'reply is OK')
      done++
    }).catch(function(err){
      t.error(err)
    });

    // callback is optional
    client.set('string key', 'string val')

    client.hSet('hash key', 'hashtest 1', 'some value').then(function (reply) {
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    }).catch(function(err){
      t.error(err, 'no hset error')
    })

    // TODO: other signatures?
    client.hSet('hash key', ['hashtest 2', 'some other value']).then(function (reply) {
    // client.hSet('hash key', 'hashtest 2', 'some other value').then(function (reply) {
      t.strictEqual(reply, 1, 'hset reply is 1')
      done++
    }).catch(function(err){
      t.error(err, 'no hset error')
    });

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
    }).catch(function(err){
      t.error(err, 'no hkeys error')
    })
  }).catch(function(err){
    t.error(err, 'no flushall error')
  })
})

// Skip testing error capture with redis 2.x. It works, but there are behaviour
// differences (e.g. `client.quit()` throws with `enable_offline_queue: false`)
// such that testing is a pain. Redis 2.x is too old to bother.
// if (semver.satisfies(redisVersion, '>=3.0.0')) {
//   test('redis client error', function (t) {
//     resetAgent(function (data) {
//       t.equal(data.transactions.length, 1, 'got 1 transaction')
//       t.equal(data.spans.length, 1, 'got 1 span')
//       t.equal(data.errors.length, 1, 'got 1 error')
//       t.equal(data.spans[0].name, 'SET', 'span.name')
//       t.equal(data.spans[0].parent_id, data.transactions[0].id, 'span.parent_id')
//       t.equal(data.spans[0].outcome, 'failure', 'span.outcome')
//       t.equal(data.errors[0].transaction_id, data.transactions[0].id, 'error.transaction_id')
//       t.equal(data.errors[0].parent_id, data.spans[0].id, 'error.parent_id, error is a child of the failing span')
//       t.equal(data.errors[0].exception.type, 'AbortError', 'error.exception.type')
//       t.end()
//     })

//     // Simulate a redis client error with `enable_offline_queue: false` and a
//     // quick `.set()` without connecting the client
//     var client = redis.createClient({
//       host: process.env.REDIS_HOST,
//       port: '6379',
//       enable_offline_queue: false
//     })

//     var t0 = agent.startTransaction('t0')
//     client.set('k', 'v').catch(function (err) {
//       console.log(err)
//       t.ok(err, 'got error from client.set')
//       t.equal(err.name, 'Error', 'error.name')
//       t0.end()
//       client.quit()
//       agent.flush()
//     }).then(function(reply){
//       // t.fail('expected error')
//     });
//   })
// }

test('client.cmd(...) call signatures', function (t) {
  let nCbCalled = 0
  function myCb () {
    nCbCalled++
  }

  resetAgent(function (data) {
    t.equal(nCbCalled, 2, 'myCb was called the expected number of times')
    t.equal(data.transactions.length, 1, 'got 1 transaction')
    data.spans.sort((a, b) => { return a.timestamp < b.timestamp ? -1 : 1 })
    t.deepEqual(
      data.spans.map(s => s.name),
      ['INFO', 'SET', 'GET', 'SET'],
      'got the expected span names'
    )
    t.end()
  })

  var client = redis.createClient('6379', process.env.REDIS_HOST)
  client.on('ready', function () {
    var t0 = agent.startTransaction('t0')

    // Use different call signatures to trigger the different forms of arguments
    // to the internal RedisClient.send_command that we are wrapping.
    client.info()
    client.set('k', 'v')
    client.get('k').then(myCb)
    client.set(['k', 'v']).then(myCb)

    t0.end()
    client.quit()
    agent.flush()
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

    var client = redis.createClient('6379', process.env.REDIS_HOST)
    client.on('ready', function () {
      var t0 = agent.startTransaction('t0')

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
