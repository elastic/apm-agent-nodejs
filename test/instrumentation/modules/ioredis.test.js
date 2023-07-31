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

var agent = require('../../..').start({
  serviceName: 'test-ioredis',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
});

var ioredisVer = require('ioredis/package.json').version;
var semver = require('semver');
if (semver.gte(ioredisVer, '5.0.0') && semver.lt(process.version, '12.22.0')) {
  console.log(
    `# SKIP ioredis@${ioredisVer} does not support node ${process.version}`,
  );
  process.exit();
}

var Redis = require('ioredis');
var test = require('tape');

var mockClient = require('../../_mock_http_client');
const { NoopApmClient } = require('../../../lib/apm-client/noop-apm-client');
const {
  findObjInArray,
  runTestFixtures,
  sortApmEvents,
} = require('../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../testconsts');

test('not nested', function (t) {
  resetAgent(done(t));

  var redis = new Redis(process.env.REDIS_HOST);

  agent.startTransaction('foo', 'bar');

  var calls = 0;

  redis.flushall(function (err, reply) {
    t.error(err);
    t.strictEqual(reply, 'OK');
    calls++;
  });

  redis.set('foo', 'bar');
  redis.get('foo', function (err, result) {
    t.error(err);
    t.strictEqual(result, 'bar');
    calls++;
  });

  redis.get('foo').then(function (result) {
    t.strictEqual(result, 'bar');
    calls++;
  });

  redis.sadd('set', 1, 3, 5, 7);
  redis.sadd('set', [1, 3, 5, 7]);

  redis.set('key', 100, 'EX', 10);

  redis.keys('*', function testing123(err, replies) {
    t.error(err);
    t.deepEqual(replies.sort(), ['foo', 'key', 'set']);
    t.strictEqual(calls, 3);

    agent.endTransaction();
    redis.disconnect();
    agent.flush();
  });
});

test('nested', function (t) {
  resetAgent(done(t));

  var redis = new Redis(process.env.REDIS_HOST);

  agent.startTransaction('foo', 'bar');

  redis.flushall(function (err, reply) {
    t.error(err);
    t.strictEqual(reply, 'OK');
    var calls = 0;

    redis.set('foo', 'bar');
    redis.get('foo', function (err, result) {
      t.error(err);
      t.strictEqual(result, 'bar');
      calls++;
    });

    redis.get('foo').then(function (result) {
      t.strictEqual(result, 'bar');
      calls++;
    });

    redis.sadd('set', 1, 3, 5, 7);
    redis.sadd('set', [1, 3, 5, 7]);

    redis.set('key', 100, 'EX', 10);

    redis.keys('*', function testing123(err, replies) {
      t.error(err);
      t.deepEqual(replies.sort(), ['foo', 'key', 'set']);
      t.strictEqual(calls, 2);

      agent.endTransaction();
      redis.disconnect();
      agent.flush();
    });
  });
});

test('error capture, no unhandledRejection on command error is introduced', function (t) {
  // Make sure there are no unhandled promise rejections
  // introduced by our promise handling. See #1518.
  let unhandledRejection = false;
  function onUnhandledRejection(e) {
    unhandledRejection = true;
  }
  process.once('unhandledRejection', onUnhandledRejection);
  t.on('end', () => {
    process.removeListener('unhandledRejection', onUnhandledRejection);
  });
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(4, function (data) {
    const getSpan = findObjInArray(data.spans, 'name', 'GET');
    t.equal(data.errors.length, 1, 'captured 1 error');
    t.equal(data.errors[0].exception.type, 'ReplyError', 'exception.type');
    t.equal(
      data.errors[0].transaction_id,
      data.transactions[0].id,
      'error.transaction_id',
    );
    t.equal(
      data.errors[0].parent_id,
      getSpan.id,
      'error.parent_id, the error is a child of the erroring span',
    );

    setTimeout(function () {
      t.notOk(unhandledRejection);
      t.end();
    }, 0);
  });

  var redis = new Redis(process.env.REDIS_HOST);
  const trans = agent.startTransaction('foo', 'bar');
  redis.hset('a', 'b', 'c');
  redis.get('a', function (err, result) {
    t.ok(err);
    trans.end();
    redis.disconnect();
    agent.flush();
  }); // wrong type, should reject
});

function done(t) {
  return function (data, cb) {
    var groups = [
      'FLUSHALL',
      'SET',
      'GET',
      'GET',
      'SADD',
      'SADD',
      'SET',
      'KEYS',
    ];

    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, groups.length);

    var trans = data.transactions[0];

    t.strictEqual(trans.name, 'foo');
    t.strictEqual(trans.type, 'bar');
    t.strictEqual(trans.result, 'success');

    groups.forEach(function (name, i) {
      const span = data.spans[i];
      t.strictEqual(span.name, name, 'span.name');
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
      t.strictEqual(
        span.parent_id,
        trans.id,
        'span is a child of the transaction',
      );
    });

    t.end();
  };
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(9, cb);
}

const testFixtures = [
  {
    name: 'ioredis ESM',
    script: 'fixtures/use-ioredis.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../loader.mjs --require=../../../start.js',
      NODE_NO_WARNINGS: '1',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    testOpts: {
      // Instrumentation *does* work with `contextManager: 'patch'`, but it
      // gets the parent incorrect for the 'INFO' span used by ioredis for
      // connection handling.
      skip:
        process.env.ELASTIC_APM_CONTEXT_MANAGER === 'patch'
          ? 'contextManager=patch'
          : false,
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        7,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      const trans = events[0].transaction;
      t.equal(trans.name, 'trans', 'transaction.name');
      t.equal(trans.type, 'custom', 'transaction.type');
      t.equal(trans.outcome, 'unknown', 'transaction.outcome');

      const spans = events.slice(1, 5).map((e) => e.span);
      const expectedSpanNames = ['SET', 'GET', 'HSET', 'GET'];
      spans.forEach((s, idx) => {
        t.equal(s.name, expectedSpanNames[idx], `span[${idx}].name`);
        t.equal(s.type, 'db', `span[${idx}].type`);
        t.equal(s.action, 'query', `span[${idx}].action`);
        t.equal(s.parent_id, trans.id, `span[${idx}].parent_id`);
        t.deepEqual(
          s.context,
          {
            service: { target: { type: 'redis' } },
            destination: {
              address: process.env.REDIS_HOST || 'localhost',
              port: 6379,
              service: { type: '', name: '', resource: 'redis' },
            },
            db: { type: 'redis' },
          },
          `span[${idx}].context`,
        );
      });

      const error = events.slice(-1)[0].error;
      t.equal(error.exception.type, 'ReplyError', 'error.exception.type');
      t.equal(error.transaction_id, trans.id, 'error.transaction_id');
      t.equal(
        error.parent_id,
        spans[spans.length - 1].id,
        'error.parent_id, it is a child of the last span',
      );
    },
  },
];

test('ioredis fixtures', (suite) => {
  // Undo the `agent._apmClient = ...` from earlier `resetAgent` usage.
  agent._apmClient = new NoopApmClient();

  runTestFixtures(suite, testFixtures);
  suite.end();
});
