/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const redisVersion = require('redis/package.json').version;
const semver = require('semver');

if (semver.lt(redisVersion, '4.0.0')) {
  console.log('# SKIP: skipping redis.test.js tests <4.0.0');
  process.exit(0);
}

if (semver.lt(process.version, '14.0.0')) {
  console.log('# SKIP: skipping redis.test.js tests node node <14 ');
  process.exit(0);
}

const agent = require('../../..').start({
  serviceName: 'test-redis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false,
});

const redis = require('redis');
const test = require('tape');

const mockClient = require('../../_mock_http_client');

test('redis', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'have 1 transaction');
    const trans = data.transactions[0];
    t.ok(trans.name, 'aTrans', 'trans.name');
    t.strictEqual(trans.result, 'success', 'trans.result');

    // Sort the remaining spans by timestamp, because asynchronous-span.end()
    // means they can be set to APM server out of order.
    const spans = data.spans.sort((a, b) => {
      return a.timestamp < b.timestamp ? -1 : 1;
    });

    const expectedSpanNames = [
      'FLUSHALL',
      'SET',
      'SET',
      'HSET',
      'HSET',
      'HKEYS',
    ];
    t.equal(
      spans.length,
      expectedSpanNames.length,
      'have the expected number of spans',
    );
    for (let i = 0; i < expectedSpanNames.length; i++) {
      const expectedName = expectedSpanNames[i];
      const span = spans[i];

      t.strictEqual(span.transaction_id, trans.id, 'span.transaction_id');
      t.strictEqual(span.name, expectedName, 'span.name');
      t.strictEqual(span.type, 'db', 'span.type');
      t.strictEqual(span.subtype, 'redis', 'span.subtype');
      t.deepEqual(
        span.context.destination,
        {
          address: process.env.REDIS_HOST || 'localhost',
          port: 6379,
          service: { name: '', type: '', resource: 'redis' },
        },
        'span.context.destination',
      );
      t.deepEqual(span.context.db, { type: 'redis' }, 'span.context.db');
      t.strictEqual(
        span.parent_id,
        trans.id,
        'span is a child of the transaction',
      );

      const offset = span.timestamp - trans.timestamp;
      t.ok(
        offset + span.duration * 1000 < trans.duration * 1000,
        'span ended before transaction ended',
      );
    }

    t.end();
  });

  const client = redis.createClient({
    socket: {
      port: '6379',
      host: process.env.REDIS_HOST,
    },
  });
  client.connect();

  const trans = agent.startTransaction('aTrans');

  client
    .flushAll()
    .then(function (reply) {
      t.strictEqual(reply, 'OK', 'reply is OK');
      let done = 0;

      client
        .set('string key', 'string val')
        .then(function (reply) {
          t.strictEqual(reply, 'OK', 'reply is OK');
          done++;
        })
        .catch(function (err) {
          t.error(err);
        });

      // callback is optional
      client.set('string key', 'string val');

      client
        .hSet('hash key', 'hashtest 1', 'some value')
        .then(function (reply) {
          t.strictEqual(reply, 1, 'hset reply is 1');
          done++;
        })
        .catch(function (err) {
          t.error(err, 'no hset error');
        });

      client
        .hSet('hash key', ['hashtest 2', 'some other value'])
        .then(function (reply) {
          t.strictEqual(reply, 1, 'hset reply is 1');
          done++;
        })
        .catch(function (err) {
          t.error(err, 'no hset error');
        });

      client
        .hKeys('hash key')
        .then(function (replies) {
          t.strictEqual(replies.length, 2, 'got two replies');
          replies.forEach(function (reply, i) {
            t.strictEqual(reply, 'hashtest ' + (i + 1), `reply ${i} value`);
          });
          done++;
          t.strictEqual(done, 4, 'done 4 callbacks');

          trans.end();
          client.quit();
          agent.flush();
        })
        .catch(function (err) {
          t.error(err, 'no hkeys error');
        });
    })
    .catch(function (err) {
      t.error(err, 'no flushall error');
    });
});

// The `redis.set('foo')` we are using to trigger a client error case only
// causes an error in redis >=4.1.0.
test(
  'redis client error',
  { skip: semver.lt(redisVersion, '4.1.0') },
  function (t) {
    resetAgent(function (data) {
      t.equal(data.transactions.length, 1, 'got 1 transaction');
      t.equal(data.spans.length, 1, 'got 1 span');
      t.equal(data.errors.length, 1, 'got 1 error');
      t.equal(data.spans[0].name, 'SET', 'span.name');
      t.equal(
        data.spans[0].parent_id,
        data.transactions[0].id,
        'span.parent_id',
      );
      t.equal(data.spans[0].outcome, 'failure', 'span.outcome');
      t.equal(
        data.errors[0].transaction_id,
        data.transactions[0].id,
        'error.transaction_id',
      );
      t.equal(
        data.errors[0].parent_id,
        data.spans[0].id,
        'error.parent_id, error is a child of the failing span',
      );
      t.equal(
        data.errors[0].exception.type,
        'TypeError',
        'error.exception.type',
      );
      t.end();
    });

    // no .finally in Node 8, endPromise performs
    // actions we'd normally perform there
    function endProimse(t0, client, agent) {
      t0.end();
      client.quit();
      agent.flush();
    }
    const client = redis.createClient({
      socket: {
        port: '6379',
        host: process.env.REDIS_HOST,
      },
    });
    client.connect();
    const t0 = agent.startTransaction('t0');
    client
      .set('foo')
      .then(function (response) {
        t.fail('no response expected');
        endProimse(t0, client, agent);
      })
      .catch(function (error) {
        t.ok(error, 'expected error');
        endProimse(t0, client, agent);
      });
  },
);

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
}
