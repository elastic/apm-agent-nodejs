/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the behaviour of the `traceContinuationStrategy` config var.

const apm = require('../').start({
  serviceName: 'test-traceContinuationStrategy',
  logLevel: 'off',
  captureExceptions: false,
  metricsInterval: '0s',
  disableSend: true,
});

const http = require('http');
const semver = require('semver');
const tape = require('tape');

const { CONTEXT_MANAGER_PATCH } = require('../lib/config/schema');

// Ensure that, by default, an HTTP request with a valid traceparent to an
// instrumented HTTP server *uses* that traceparent.
tape.test('traceContinuationStrategy default is continue', (t) => {
  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction;
    t.ok(currTrans, 'have a currentTransaction');
    t.equal(
      currTrans.traceId,
      '12345678901234567890123456789012',
      `currentTransaction.traceId (${currTrans.traceId})`,
    );
    t.equal(
      currTrans.parentId,
      '1234567890123456',
      `currentTransaction.parentId (${currTrans.parentId})`,
    );
    res.end('pong');
  });
  server.listen(function () {
    const getOpts = {
      protocol: 'http:',
      hostname: 'localhost',
      port: server.address().port,
      pathname: '/',
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      },
    };
    http.get(getOpts, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response');
      res.resume();
      res.on('end', function () {
        server.close();
        t.end();
      });
    });
  });
});

tape.test('traceContinuationStrategy=continue', (t) => {
  // Hack in the traceContinuationStrategy value. This is equiv to having
  // started the agent with this setting.
  apm._conf.traceContinuationStrategy = 'continue';

  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction;
    t.ok(currTrans, 'have a currentTransaction');
    t.equal(
      currTrans.traceId,
      '12345678901234567890123456789012',
      `currentTransaction.traceId (${currTrans.traceId})`,
    );
    t.equal(
      currTrans.parentId,
      '1234567890123456',
      `currentTransaction.parentId (${currTrans.parentId})`,
    );
    res.end('pong');
  });
  server.listen(function () {
    if (
      semver.satisfies(process.version, '<=8') &&
      apm._conf.contextManager === CONTEXT_MANAGER_PATCH
    ) {
      // There is some bug in node v8 and lower and with contextManager="patch"
      // instrumentation where this listener callback takes the run context of
      // the preceding test's transaction. Hack it back.
      apm._instrumentation.supersedeWithEmptyRunContext();
    }

    const getOpts = {
      protocol: 'http:',
      hostname: 'localhost',
      port: server.address().port,
      pathname: '/',
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      },
    };
    http.get(getOpts, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response');
      res.resume();
      res.on('end', function () {
        server.close();
        t.end();
      });
    });
  });
});

// With 'restart' the incoming traceparent should be ignored.
tape.test('traceContinuationStrategy=restart', (t) => {
  // Hack in the traceContinuationStrategy value. This is equiv to having
  // started the agent with this setting.
  apm._conf.traceContinuationStrategy = 'restart';

  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction;
    t.ok(currTrans, 'have a currentTransaction');
    t.not(
      currTrans.traceId,
      '12345678901234567890123456789012',
      `currentTransaction.traceId (${currTrans.traceId})`,
    );
    t.not(
      currTrans.parentId,
      '1234567890123456',
      `currentTransaction.parentId (${currTrans.parentId})`,
    );
    res.end('pong');
  });
  server.listen(function () {
    if (
      semver.satisfies(process.version, '<=8') &&
      apm._conf.contextManager === CONTEXT_MANAGER_PATCH
    ) {
      // There is some bug in node v8 and lower and with contextManager="patch"
      // instrumentation where this listener callback takes the run context of
      // the preceding test's transaction. Hack it back.
      apm._instrumentation.supersedeWithEmptyRunContext();
    }

    const getOpts = {
      protocol: 'http:',
      hostname: 'localhost',
      port: server.address().port,
      pathname: '/',
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      },
    };
    http.get(getOpts, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response');
      res.resume();
      res.on('end', function () {
        server.close();
        t.end();
      });
    });
  });
});

// With 'restart_external' behaviour depends on if 'es:...' is in 'tracestate'.
tape.test('traceContinuationStrategy=restart_external (no tracestate)', (t) => {
  // Hack in the traceContinuationStrategy value. This is equiv to having
  // started the agent with this setting.
  apm._conf.traceContinuationStrategy = 'restart_external';

  const server = http.createServer(function (_req, res) {
    const currTrans = apm.currentTransaction;
    t.ok(currTrans, 'have a currentTransaction');
    t.not(
      currTrans.traceId,
      '12345678901234567890123456789012',
      `currentTransaction.traceId (${currTrans.traceId})`,
    );
    t.not(
      currTrans.parentId,
      '1234567890123456',
      `currentTransaction.parentId (${currTrans.parentId})`,
    );
    const serialized = currTrans.toJSON();
    t.deepEqual(
      serialized.links,
      [
        {
          trace_id: '12345678901234567890123456789012',
          span_id: '1234567890123456',
        },
      ],
      'serialized transaction has the correct span link',
    );
    res.end('pong');
  });
  server.listen(function () {
    if (
      semver.satisfies(process.version, '<=8') &&
      apm._conf.contextManager === CONTEXT_MANAGER_PATCH
    ) {
      // There is some bug in node v8 and lower and with contextManager="patch"
      // instrumentation where this listener callback takes the run context of
      // the preceding test's transaction. Hack it back.
      apm._instrumentation.supersedeWithEmptyRunContext();
    }

    const getOpts = {
      protocol: 'http:',
      hostname: 'localhost',
      port: server.address().port,
      pathname: '/',
      headers: {
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      },
    };
    http.get(getOpts, function (res) {
      t.equal(res.statusCode, 200, 'client got HTTP 200 response');
      res.resume();
      res.on('end', function () {
        server.close();
        t.end();
      });
    });
  });
});

tape.test(
  'traceContinuationStrategy=restart_external (tracestate without "es")',
  (t) => {
    // Hack in the traceContinuationStrategy value. This is equiv to having
    // started the agent with this setting.
    apm._conf.traceContinuationStrategy = 'restart_external';

    const server = http.createServer(function (_req, res) {
      const currTrans = apm.currentTransaction;
      t.ok(currTrans, 'have a currentTransaction');
      t.not(
        currTrans.traceId,
        '12345678901234567890123456789012',
        `currentTransaction.traceId (${currTrans.traceId})`,
      );
      t.not(
        currTrans.parentId,
        '1234567890123456',
        `currentTransaction.parentId (${currTrans.parentId})`,
      );
      const serialized = currTrans.toJSON();
      t.deepEqual(
        serialized.links,
        [
          {
            trace_id: '12345678901234567890123456789012',
            span_id: '1234567890123456',
          },
        ],
        'serialized transaction has the correct span link',
      );
      res.end('pong');
    });
    server.listen(function () {
      if (
        semver.satisfies(process.version, '<=8') &&
        apm._conf.contextManager === CONTEXT_MANAGER_PATCH
      ) {
        // There is some bug in node v8 and lower and with contextManager="patch"
        // instrumentation where this listener callback takes the run context of
        // the preceding test's transaction. Hack it back.
        apm._instrumentation.supersedeWithEmptyRunContext();
      }

      const getOpts = {
        protocol: 'http:',
        hostname: 'localhost',
        port: server.address().port,
        pathname: '/',
        headers: {
          traceparent:
            '00-12345678901234567890123456789012-1234567890123456-01',
          tracestate: 'notes=k:v,esnope=k:v,acme=foo:bar;spam:eggs',
        },
      };
      http.get(getOpts, function (res) {
        t.equal(res.statusCode, 200, 'client got HTTP 200 response');
        res.resume();
        res.on('end', function () {
          server.close();
          t.end();
        });
      });
    });
  },
);

tape.test(
  'traceContinuationStrategy=restart_external (tracestate with "es")',
  (t) => {
    // Hack in the traceContinuationStrategy value. This is equiv to having
    // started the agent with this setting.
    apm._conf.traceContinuationStrategy = 'restart_external';

    const server = http.createServer(function (_req, res) {
      const currTrans = apm.currentTransaction;
      t.ok(currTrans, 'have a currentTransaction');
      t.equal(
        currTrans.traceId,
        '12345678901234567890123456789012',
        `currentTransaction.traceId (${currTrans.traceId})`,
      );
      t.equal(
        currTrans.parentId,
        '1234567890123456',
        `currentTransaction.parentId (${currTrans.parentId})`,
      );
      const serialized = currTrans.toJSON();
      t.notOk(
        serialized.links,
        'serialized transaction does *not* have a span link for this traceparent',
      );
      res.end('pong');
    });
    server.listen(function () {
      if (
        semver.satisfies(process.version, '<=8') &&
        apm._conf.contextManager === CONTEXT_MANAGER_PATCH
      ) {
        // There is some bug in node v8 and lower and with contextManager="patch"
        // instrumentation where this listener callback takes the run context of
        // the preceding test's transaction. Hack it back.
        apm._instrumentation.supersedeWithEmptyRunContext();
      }

      const getOpts = {
        protocol: 'http:',
        hostname: 'localhost',
        port: server.address().port,
        pathname: '/',
        headers: {
          traceparent:
            '00-12345678901234567890123456789012-1234567890123456-01',
          tracestate: 'acme=foo:bar;spam:eggs , es=k:v',
        },
      };
      http.get(getOpts, function (res) {
        t.equal(res.statusCode, 200, 'client got HTTP 200 response');
        res.resume();
        res.on('end', function () {
          server.close();
          t.end();
        });
      });
    });
  },
);
