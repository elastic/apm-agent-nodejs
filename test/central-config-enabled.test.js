/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

delete process.env.ELASTIC_APM_CENTRAL_CONFIG; // In case this is set, don't let it break the test.

const { URL } = require('url');
const http = require('http');

const test = require('tape');

const Agent = require('./_agent');
const { CENTRAL_CONFIG_OPTS } = require('../lib/config/schema');

const runTestsWithServer = (t, updates, expect) => {
  let agent;

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config with log_level=error.
    const url = new URL(req.url, 'relative:///');
    t.strictEqual(
      url.pathname,
      '/config/v1/agents',
      'mock apm-server got central config request',
    );
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate',
    });
    res.end(JSON.stringify(updates));

    // 4. After the 'config' event is handled in the agent, the expected
    //    config vars should be updated.
    agent._apmClient.once('config', function (remoteConf) {
      for (const key in expect) {
        t.deepEqual(
          agent._conf[key],
          expect[key],
          `agent conf for key ${key} was updated to expected value`,
        );
      }

      // 5. Clean up and finish.
      agent.destroy();
      server.close();
      t.end();
    });
  });

  // 1. Start a mock APM Server.
  server.listen(function () {
    // 2. Start an agent.
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      logLevel: 'off', // silence for cleaner test output
      captureExceptions: false,
      apmServerVersion: '8.0.0',
      metricsInterval: 0,
      centralConfig: true,
    });
  });
};

test('remote config enabled', function (t) {
  const updates = {
    capture_body: 'all',
    exit_span_min_duration: '25ms',
    ignore_message_queues: 'spam,eggs, (?-i)ham ',
    log_level: 'warn',
    sanitize_field_names: 'password, pass*, *auth*',
    span_stack_trace_min_duration: '50ms',
    trace_continuation_strategy: 'restart_external',
    // Test that central config returing an array works, even though, IIUC,
    // it will always return plain strings.
    transaction_ignore_urls: ['foo', 'bar'],
    transaction_max_spans: '99',
    transaction_sample_rate: '0.42',
  };
  const expect = {
    captureBody: 'all',
    exitSpanMinDuration: 0.025,
    ignoreMessageQueues: ['spam', 'eggs', '(?-i)ham'],
    ignoreMessageQueuesRegExp: [/^spam$/i, /^eggs$/i, /^ham$/],
    logLevel: 'warn',
    sanitizeFieldNames: ['password', 'pass*', '*auth*'],
    sanitizeFieldNamesRegExp: [/^password$/i, /^pass.*$/i, /^.*auth.*$/i],
    spanStackTraceMinDuration: 0.05,
    traceContinuationStrategy: 'restart_external',
    transactionIgnoreUrls: ['foo', 'bar'],
    transactionIgnoreUrlRegExp: [/^foo$/i, /^bar$/i],
    transactionMaxSpans: 99,
    transactionSampleRate: 0.42,
  };

  t.deepEqual(
    Object.keys(updates).sort(),
    Object.keys(CENTRAL_CONFIG_OPTS).sort(),
    'this test uses every available central config var name (config.CENTRAL_CONFIG_OPTS)',
  );

  runTestsWithServer(t, updates, expect);
});

// Tests for transaction_sample_rate precision from central config.
[
  ['0', 0],
  ['0.0001', 0.0001],
  ['0.00002', 0.0001],
  ['0.300000002', 0.3],
  ['0.444444', 0.4444],
  ['0.555555', 0.5556],
  ['1', 1],
].forEach(function ([centralVal, expected]) {
  test(`central transaction_sample_rate precision: "${centralVal}"`, function (t) {
    runTestsWithServer(
      t,
      { transaction_sample_rate: centralVal },
      { transactionSampleRate: expected },
    );
  });
});

// Ensure the logger updates if the central config `log_level` changes.
test(
  'agent.logger updates for central config `log_level` change',
  { timeout: 5000 },
  function (t) {
    let agent;

    const server = http.createServer((req, res) => {
      // 3. The agent should fetch central config with log_level=error.
      const url = new URL(req.url, 'relative:///');
      t.strictEqual(
        url.pathname,
        '/config/v1/agents',
        'mock apm-server got central config request',
      );
      res.writeHead(200, {
        Etag: 1,
        'Cache-Control': 'max-age=30, must-revalidate',
      });
      res.end(JSON.stringify({ log_level: 'error' }));

      agent._apmClient.once('config', function () {
        // 4. agent.logger should be updated from central config.
        t.equal(
          agent.logger.level,
          'error',
          'shortly after fetching central config, agent.logger level should be updated',
        );

        agent.destroy();
        server.close();
        t.end();
      });
    });

    // 1. Start a mock APM Server.
    server.listen(function () {
      // 2. Start an agent with logLevel=warn.
      agent = new Agent().start({
        serverUrl: 'http://localhost:' + server.address().port,
        serviceName: 'test',
        captureExceptions: false,
        apmServerVersion: '8.0.0',
        metricsInterval: 0,
        centralConfig: true,
        logLevel: 'warn',
      });

      t.equal(
        agent.logger.level,
        'warn',
        'immediately after .start() logger level should be the given "warn" level',
      );
    });
  },
);

// Ensure that a central config that updates some var other than `cloudProvider`
// does not result in *cloudProvider* being updated (issue #1976).
test(
  'central config change does not erroneously update cloudProvider',
  { timeout: 5000 },
  function (t) {
    let agent;

    const server = http.createServer((req, res) => {
      // 3. The agent should fetch central config. We provide some non-empty
      //    config change that does not include `cloudProvider`.
      const url = new URL(req.url, 'relative:///');
      t.strictEqual(
        url.pathname,
        '/config/v1/agents',
        'mock apm-server got central config request',
      );
      res.writeHead(200, {
        Etag: 1,
        'Cache-Control': 'max-age=30, must-revalidate',
      });
      res.end(JSON.stringify({ log_level: 'error' }));

      agent._apmClient.once('config', function () {
        // 4. Ensure that `cloudProvider` is *not* reset to the default "auto".
        t.equal(
          agent._conf.cloudProvider,
          'aws',
          'after fetching central config, cloudProvider is not reset to default',
        );

        agent.destroy();
        server.close();
        t.end();
      });
    });

    // 1. Start a mock APM Server.
    server.listen(function () {
      // 2. Start an agent with cloudProvider=aws.
      agent = new Agent().start({
        serverUrl: 'http://localhost:' + server.address().port,
        serviceName: 'test',
        centralConfig: true,
        cloudProvider: 'aws',
        // These settings to reduce some agent activity:
        captureExceptions: false,
        apmServerVersion: '8.0.0',
        metricsInterval: 0,
      });

      t.equal(
        agent._conf.cloudProvider,
        'aws',
        'immediately after .start(), cloudProvider=aws',
      );
    });
  },
);
