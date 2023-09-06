/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Memcached isn't supported on Windows
if (process.platform === 'win32') {
  console.log('# SKIP memcached does not support Windows');
  process.exit();
}

var agent = require('../../..').start({
  serviceName: 'test-memcached',
  captureExceptions: false,
  metricsInterval: '0s',
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false,
});

var test = require('tape');
var mockClient = require('../../_mock_http_client');

var host = process.env.MEMCACHED_HOST || '127.0.0.1';

test('memcached', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, 7);

    const spans = data.spans.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });

    t.strictEqual(spans[0].name, 'memcached.set');
    t.strictEqual(spans[0].type, 'db');
    t.strictEqual(spans[0].subtype, 'memcached');
    t.strictEqual(spans[0].action, 'set');
    t.strictEqual(spans[0].context.db.statement, 'set foo');
    t.strictEqual(spans[1].name, 'memcached.get');
    t.strictEqual(spans[1].type, 'db');
    t.strictEqual(spans[1].subtype, 'memcached');
    t.strictEqual(spans[1].action, 'get');
    t.strictEqual(spans[1].context.db.statement, 'get foo');
    t.strictEqual(spans[2].name, 'memcached.replace');
    t.strictEqual(spans[2].type, 'db');
    t.strictEqual(spans[2].subtype, 'memcached');
    t.strictEqual(spans[2].action, 'replace');
    t.strictEqual(spans[2].context.db.statement, 'replace foo');
    t.strictEqual(spans[3].name, 'memcached.get');
    t.strictEqual(spans[3].type, 'db');
    t.strictEqual(spans[3].subtype, 'memcached');
    t.strictEqual(spans[3].action, 'get');
    t.strictEqual(spans[3].context.db.statement, 'get foo');
    t.strictEqual(spans[4].name, 'memcached.touch');
    t.strictEqual(spans[4].type, 'db');
    t.strictEqual(spans[4].subtype, 'memcached');
    t.strictEqual(spans[4].action, 'touch');
    t.strictEqual(spans[4].context.db.statement, 'touch foo');
    t.strictEqual(spans[5].name, 'memcached.delete');
    t.strictEqual(spans[5].type, 'db');
    t.strictEqual(spans[5].subtype, 'memcached');
    t.strictEqual(spans[5].action, 'delete');
    t.strictEqual(spans[5].context.db.statement, 'delete foo');
    t.strictEqual(spans[6].name, 'memcached.get');
    t.strictEqual(spans[6].type, 'db');
    t.strictEqual(spans[6].subtype, 'memcached');
    t.strictEqual(spans[6].action, 'get');
    t.strictEqual(spans[6].context.db.statement, 'get foo');
    spans.forEach((span) => {
      t.deepEqual(
        span.context.service.target,
        { type: 'memcached' },
        'span.context.service.target',
      );
      t.deepEqual(
        span.context.destination,
        {
          service: { type: '', name: '', resource: 'memcached' },
          address: host,
          port: 11211,
        },
        'span.context.destination',
      );
    });
    spans.forEach((span) => {
      t.equal(
        span.parent_id,
        data.transactions[0].id,
        'span is a child of the transaction',
      );
    });
    t.end();
  });

  var Memcached = require('memcached');
  var cache = new Memcached(`${host}:11211`, { timeout: 500 });
  agent.startTransaction('myTrans');
  cache.set('foo', 'bar', 300, (err) => {
    t.ok(
      agent.currentSpan === null,
      'memcached span should not be currentSpan in callback',
    );
    t.error(err);
    cache.get('foo', (err, data) => {
      t.error(err);
      t.strictEqual(data, 'bar');
      cache.replace('foo', 'fizz', 300, (err) => {
        t.error(err);
        cache.get('foo', (err, data) => {
          t.error(err);
          t.strictEqual(data, 'fizz');
          cache.touch('foo', 300, (err) => {
            t.error(err);
            cache.del('foo', (err) => {
              t.error(err);
              cache.get('foo', (err, data) => {
                t.error(err);
                t.strictEqual(data, undefined);
                cache.end();
                agent.endTransaction();
                agent.flush();
              });
            });
          });
        });
      });
    });
  });
  t.ok(
    agent.currentSpan === null,
    'memcached span should not be currentSpan in same tick after client method call',
  );
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(8, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
