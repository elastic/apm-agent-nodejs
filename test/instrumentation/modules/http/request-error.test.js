/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-request-error',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
});
const net = require('net');
const http = require('http');
const https = require('https');
const test = require('tape');
const mockClient = require('../../../_mock_http_client');

for (const [name, mod] of [
  ['http', http],
  ['https', https],
]) {
  test(`${name}: connection refused ends the outgoing span`, function (t) {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', function () {
      const port = server.address().port;
      server.close(function () {
        agent._instrumentation.testReset();
        agent._apmClient = mockClient(function (data) {
          t.equal(data.transactions.length, 1, 'one transaction');
          t.equal(data.spans.length, 1, 'one ended span');
          t.equal(data.errors.length, 1, 'one captured error');
          if (data.spans.length && data.errors.length) {
            const span = data.spans[0];
            t.equal(span.outcome, 'failure', 'failed span');
            t.equal(span.context.http.method, 'GET');
            t.equal(span.context.http.url, `${name}://127.0.0.1:${port}/`);
            t.equal(data.errors[0].parent_id, span.id, 'error belongs to span');
            t.equal(data.errors[0].exception.code, 'ECONNREFUSED');
          }
          t.end();
        });
        const trans = agent.startTransaction('connection refused');
        const req = mod.request({ hostname: '127.0.0.1', port });
        req.on('error', function (err) {
          t.equal(err.code, 'ECONNREFUSED', 'application receives error');
        });
        req.on('close', function () {
          trans.end();
        });
        req.end();
      });
    });
  });
}
