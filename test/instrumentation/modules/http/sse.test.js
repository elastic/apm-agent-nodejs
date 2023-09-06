/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-sse',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
});

var http = require('http');

var test = require('tape');

var mockClient = require('../../../_mock_http_client');

test('normal response', function (t) {
  resetAgent(2, function (data) {
    assertNonSSEResponse(t, data);
    t.end();
  });

  var server = http.createServer(function (req, res) {
    var span = agent.startSpan('foo', 'bar');
    setTimeout(function () {
      if (span) span.end();
      res.end();
    }, 10);
  });

  request(server);
});

test('SSE response with explicit headers', function (t) {
  resetAgent(1, function (data) {
    assertSSEResponse(t, data);
    t.end();
  });

  var server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    var span = agent.startSpan('foo', 'bar');
    setTimeout(function () {
      if (span) span.end();
      res.end();
    }, 10);
  });

  request(server);
});

test('SSE response with implicit headers', function (t) {
  resetAgent(1, function (data) {
    assertSSEResponse(t, data);
    t.end();
  });

  var server = http.createServer(function (req, res) {
    res.setHeader('Content-type', 'text/event-stream; foo');
    res.write('data: hello world\n\n');
    var span = agent.startSpan('foo', 'bar');
    setTimeout(function () {
      if (span) span.end();
      res.end();
    }, 10);
  });

  request(server);
});

function assertNonSSEResponse(t, data) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 1);

  var trans = data.transactions[0];
  var span = data.spans[0];

  t.strictEqual(trans.name, 'GET unknown route');
  t.strictEqual(trans.context.request.method, 'GET');
  t.strictEqual(span.name, 'foo');
  t.strictEqual(span.type, 'bar');
}

function assertSSEResponse(t, data) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 0);

  var trans = data.transactions[0];

  t.strictEqual(trans.name, 'GET unknown route');
  t.strictEqual(trans.context.request.method, 'GET');
}

function request(server) {
  server.listen(function () {
    var port = server.address().port;
    http
      .request({ port }, function (res) {
        res.on('end', function () {
          server.close();
        });
        res.resume();
      })
      .end();
  });
}

function resetAgent(expected, cb) {
  agent._apmClient = mockClient(expected, cb);
  agent._instrumentation.testReset();
}
