/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test that `disableInstrumentations=redis` works.

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

const test = require('tape');

const apm = require('../../../');
const { MockAPMServer } = require('../../_mock_apm_server');

test('disableInstrumentations=redis works', function (suite) {
  let server;
  let serverUrl;

  suite.test('setup', function (t) {
    server = new MockAPMServer({ mockLambdaExtension: true });
    server.start(function (serverUrl_) {
      serverUrl = serverUrl_;
      t.comment('mock APM serverUrl: ' + serverUrl);
      apm.start({
        serverUrl,
        serviceName: 'test-redis-disabled',
        metricsInterval: '0s',
        centralConfig: false,
        logLevel: 'off',
        disableInstrumentations: 'redis',
      });
      t.comment('APM agent started');
      t.end();
    });
  });

  suite.test('using redis client does not create spans', function (t) {
    server.clear();

    const redis = require('redis');

    const client = redis.createClient({
      socket: {
        port: '6379',
        host: process.env.REDIS_HOST,
      },
    });
    client.connect();

    const t0 = apm.startTransaction('t0');

    // Because of `disableInstrumentaions` above, this client usage should
    // *not* result in a span.
    client.set('foo', 'bar').finally(async () => {
      t0.end();
      client.quit();
      await apm.flush();

      t.equal(server.events.length, 2);
      t.ok(server.events[0].metadata);
      t.equal(
        server.events[1].transaction.name,
        't0',
        'only got the manual transaction',
      );
      t.end();
    });
  });

  suite.test('teardown', function (t) {
    server.close();
    t.end();
    apm.destroy();
  });

  suite.end();
});
