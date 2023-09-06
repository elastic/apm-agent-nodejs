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

// Test node v18's `fetch` implementation (based on undici).
//
// Importantly, this test must not `require('undici')` because part of the
// test is whether the APM agent knows to enable undici instrumentation even
// without the import.

if (!global.fetch) {
  console.log(`# SKIP there is no global fetch() in node ${process.version}`);
  process.exit();
}

process.env.ELASTIC_APM_TEST = true;
const { CapturingTransport } = require('../../../_capturing_transport');
const apm = require('../../../..').start({
  serviceName: 'test-fetch',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
  transport() {
    return new CapturingTransport();
  },
});

const http = require('http');
const { promisify } = require('util');
const test = require('tape');

const promisyApmFlush = promisify(apm.flush.bind(apm));
let server;
let origin;
let lastServerReq;

// ---- support functions

function assertUndiciSpan(t, span, url, reqFailed) {
  const u = new URL(url);
  t.equal(span.name, `GET ${u.host}`, 'span.name');
  t.equal(span.type, 'external', 'span.type');
  t.equal(span.subtype, 'http', 'span.subtype');
  t.equal(span.action, 'GET', 'span.action');
  t.equal(span.outcome, reqFailed ? 'failure' : 'success', 'span.outcome');
  t.equal(span.context.http.method, 'GET', 'span.context.http.method');
  t.equal(span.context.http.url, url, 'span.context.http.url');
  if (!reqFailed) {
    t.equal(
      span.context.http.status_code,
      200,
      'span.context.http.status_code',
    );
    t.equal(
      span.context.http.response.encoded_body_size,
      4,
      'span.context.http.response.encoded_body_size',
    );
  }
  t.deepEqual(
    span.context.service.target,
    { type: 'http', name: u.host },
    'span.context.service.target',
  );
  t.deepEqual(
    span.context.destination,
    {
      address: u.hostname,
      port: Number(u.port),
      service: { type: '', name: '', resource: u.host },
    },
    'span.context.destination',
  );
}

// ---- tests

test('setup', (t) => {
  server = http.createServer((req, res) => {
    lastServerReq = req;
    req.resume();
    req.on('end', () => {
      setTimeout(() => {
        res.end('pong');
      }, 10);
    });
  });
  server.listen(() => {
    origin = `http://localhost:${server.address().port}`;
    t.end();
  });
});

test('fetch', async (t) => {
  apm._apmClient.clear();
  const aTrans = apm.startTransaction('aTransName');

  const url = origin + '/ping';
  const res = await fetch(url);
  t.equal(res.status, 200, 'res.status');
  const text = await res.text();
  t.equal(text, 'pong', 'response body');

  aTrans.end();
  t.error(await promisyApmFlush(), 'no apm.flush() error');

  t.equal(apm._apmClient.spans.length, 1);
  const span = apm._apmClient.spans[0];
  assertUndiciSpan(t, span, url);

  // Test trace-context propagation.
  t.equal(
    lastServerReq.headers.traceparent,
    `00-${span.trace_id}-${span.id}-01`,
    'serverReq.headers.traceparent',
  );
  t.equal(
    lastServerReq.headers.tracestate,
    'es=s:1',
    'serverReq.headers.tracestate',
  );

  t.end();
});

test('teardown', (t) => {
  server.close();

  // Note that this test file will now hang for ~4s until Node's bundled
  // undici (used to implement `fetch()`) Keep-Alive timeout ends. I don't
  // know of a way to avoid that.
  t.comment('expected 4s hang for fetch() internal Keep-Alive timeout');

  t.end();
});
