/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the behaviour of the agent configured with 'contextPropagationOnly=true'.

const { Writable } = require('stream');

const ecsFormat = require('@elastic/ecs-pino-format');
let http; // required below, *after* apm.start()
const pino = require('pino');
const tape = require('tape');

const apm = require('../');
const { NoopApmClient } = require('../lib/apm-client/noop-apm-client');
const { MockAPMServer } = require('./_mock_apm_server');

tape.test('contextPropagationOnly', function (suite) {
  let server;
  let serverUrl;
  const METRICS_INTERVAL_S = 1;

  suite.test('setup', function (t) {
    server = new MockAPMServer();
    server.start(function (serverUrl_) {
      serverUrl = serverUrl_;
      t.comment('mock APM serverUrl: ' + serverUrl);
      apm.start({
        serverUrl,
        serviceName: 'test-disable-send',
        logLevel: 'off',
        captureExceptions: false,
        metricsInterval: `${METRICS_INTERVAL_S}s`, // Try to force getting metrics soon.
        transport: function customTransport(conf, agent) {
          throw new Error(
            'custom transport should not get called with contextPropagationOnly=true',
          );
        },
        contextPropagationOnly: true,
      });
      t.comment('apm started');

      // Intentionally delay import of 'http' until after we've started the
      // APM agent so HTTP requests are instrumented.
      http = require('http');

      t.end();
    });
  });

  suite.test(
    'transport should be NoopApmClient if contextPropagationOnly=true',
    function (t) {
      t.ok(
        apm._apmClient instanceof NoopApmClient,
        'agent transport is NoopApmClient',
      );
      t.end();
    },
  );

  // Send a request:
  //    client -> serviceB -> serviceA
  // and assert that:
  // 1. the traceparent header automatically propagates the same trace_id
  //    between services B and A, and
  // 2. log enrichment (adding trace.id et al) still works
  suite.test(
    'ensure distributed tracing and log enrichment still works',
    function (t) {
      let headersA;
      let traceparentA;
      let traceparentB;

      class LogCapturer extends Writable {
        constructor(options) {
          super(options);
          this.chunks = [];
        }

        _write(chunk, _encoding, cb) {
          this.chunks.push(chunk);
          cb();
        }

        getLogRecords() {
          return this.chunks
            .join('')
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line));
        }
      }
      const logStream = new LogCapturer();

      // `_elasticApm` is an internal/test-only option added in
      // @elastic/ecs-pino-format@1.2.0 to allow passing in the import agent
      // package that isn't `require`able at "elastic-apm-node".
      const log = pino(ecsFormat({ _elasticApm: apm }), logStream);
      const logA = log.child({ 'event.module': 'serviceA' });
      const logB = log.child({ 'event.module': 'serviceB' });

      const serviceA = http.createServer(function (req, res) {
        logA.info('handle request');
        headersA = req.headers;
        traceparentA = apm.currentTraceparent;
        t.comment(`service A traceparent: ${traceparentA}`);
        res.setHeader('Service', 'A');
        res.end('the answer is 42');
      });
      serviceA.listen(function () {
        const urlA = 'http://localhost:' + serviceA.address().port;

        const serviceB = http.createServer(function (req, res) {
          logB.info('handle request');
          traceparentB = apm.currentTraceparent;
          t.comment(`service B traceparent: ${traceparentB}`);
          res.setHeader('Service', 'B');
          http.get(urlA, function (resA) {
            let bodyA = '';
            resA.on('data', function (chunk) {
              bodyA += chunk;
            });
            resA.on('end', function () {
              res.setHeader('Service', 'B');
              res.end('from service A: ' + bodyA);
            });
          });
        });
        serviceB.listen(function () {
          const urlB = 'http://localhost:' + serviceB.address().port;

          log.info('send client request');
          t.equal(
            apm.currentTraceparent,
            null,
            'there is no current traceparent before our client request',
          );
          http.get(urlB, function (resB) {
            log.info('client got response');
            let bodyB = '';
            resB.on('data', function (chunk) {
              bodyB += chunk;
            });
            resB.on('end', function () {
              t.equal(
                bodyB,
                'from service A: the answer is 42',
                'got expected body from client request',
              );
              const traceId = traceparentA.split('-')[1];
              t.equal(
                traceId,
                traceparentB.split('-')[1],
                'the trace_id from apm.currentTraceparent in service A and B requests match',
              );
              t.equal(
                headersA.tracestate,
                'es=s:1',
                'service A request got expected "tracestate" header',
              );

              const recs = logStream.getLogRecords();
              t.equal(
                recs[0].trace,
                undefined,
                `log record 0 "${recs[0].message}" has no trace.id because trace has not yet started`,
              );
              t.equal(
                recs[1]['event.module'],
                'serviceB',
                `log record 1 "${recs[1].message}" is from serviceB`,
              );
              t.equal(
                recs[1].trace.id,
                traceId,
                `log record 1 "${recs[1].message}" has trace.id set ${traceId}`,
              );
              t.equal(
                recs[2]['event.module'],
                'serviceA',
                `log record 2 "${recs[1].message}" is from serviceA`,
              );
              t.equal(
                recs[2].trace.id,
                traceId,
                `log record 2 "${recs[2].message}" has trace.id set ${traceId}`,
              );

              t.equal(
                server.events.length,
                0,
                'no events sent to APM server intake',
              );

              serviceB.close();
              serviceA.close();
              t.end();
            });
          });
        });
      });
    },
  );

  suite.test('transactions and spans are not sent to APM server', function (t) {
    const tx = apm.startTransaction('mytx');
    const s = tx.startSpan('myspan');
    setImmediate(function () {
      s.end();
      tx.end();
      apm.flush(function onFlushed() {
        t.ok(tx.id, 'transaction has an id: ' + tx.id);
        t.ok(s.id, 'span has an id: ' + s.id);
        t.equal(server.events.length, 0, 'no events sent to APM server intake');
        t.end();
      });
    });
  });

  suite.test('errors are not sent to APM server', function (t) {
    const start = process.hrtime();
    apm.captureError(new Error('myboom'), function (_, errId) {
      const duration = process.hrtime(start);

      t.ok(
        errId,
        'apm.captureError still calls back with an error id: ' + errId,
      );

      // Test captureError speed as a proxy for testing that it avoids
      // stacktrace collection when contextPropagationOnly=true. It isn't a
      // perfect way to test that.
      const durationMs = duration[0] / 1e3 + duration[1] / 1e6;
      const THRESHOLD_MS = 10; // Is this long enough for slow CI?
      t.ok(
        durationMs < THRESHOLD_MS,
        `captureError is fast (<${THRESHOLD_MS}ms): ${durationMs}ms`,
      );

      t.equal(server.events.length, 0, 'no events sent to APM server intake');
      t.end();
    });
  });

  suite.test('metrics are not sent to APM server', function (t) {
    setTimeout(function afterMetricsInterval() {
      t.equal(
        server.events.length,
        0,
        'after metricsInterval, no events sent to APM server intake',
      );
      t.end();
    }, METRICS_INTERVAL_S * 1000);
  });

  suite.test('teardown', function (t) {
    server.close();
    t.end();
    apm.destroy();
  });

  suite.end();
});
