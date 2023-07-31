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

// this test file is about testing `legacyMode`
// https://github.com/redis/node-redis/blob/HEAD/docs/v3-to-v4.md#legacy-mode
const redisVersion = require('redis/package.json').version;
const semver = require('semver');
if (semver.lt(redisVersion, '4.0.0')) {
  console.log('# SKIP: skipping redis4-legacy.test.js tests');
  process.exit(0);
}

if (semver.lt(process.version, '14.0.0')) {
  console.log('# SKIP: skipping redis4-legacy.test.js tests node node <14 ');
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
      t.strictEqual(span.action, 'query', 'span.action');
      t.deepEqual(
        span.context.service.target,
        { type: 'redis' },
        'span.context.service.target',
      );
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
    client.disconnect();
  });

  const client = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: '6379',
    },
    legacyMode: true,
  });

  client.on('error', (err) => console.log('client error', err));
  client.connect();
  const trans = agent.startTransaction('aTrans');

  client.flushall(function (err, reply) {
    t.error(err, 'no flushall error');
    t.strictEqual(reply, 'OK', 'reply is OK');
    let done = 0;

    client.set('string key', 'string val', function (err, reply) {
      t.error(err);
      t.strictEqual(reply, 'OK', 'reply is OK');
      done++;
    });

    // callback is optional
    client.set('string key', 'string val');

    client.hset('hash key', 'hashtest 1', 'some value', function (err, reply) {
      t.error(err, 'no hset error');
      t.strictEqual(reply, 1, 'hset reply is 1');
      done++;
    });
    client.hset(
      ['hash key', 'hashtest 2', 'some other value'],
      function (err, reply) {
        t.error(err, 'no hset error');
        t.strictEqual(reply, 1, 'hset reply is 1');
        done++;
      },
    );

    client.hkeys('hash key', function (err, replies) {
      t.error(err, 'no hkeys error');
      t.strictEqual(replies.length, 2, 'got two replies');
      replies.forEach(function (reply, i) {
        t.strictEqual(reply, 'hashtest ' + (i + 1), `reply ${i} value`);
      });
      done++;
      t.strictEqual(done, 4, 'done 4 callbacks');

      trans.end();
      agent.flush();
    });
  });
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
}
