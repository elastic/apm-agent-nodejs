/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-request',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
});

var http = require('http');

var test = require('tape');
var express = require('express');
var request = require('request');

var mockClient = require('../../../_mock_http_client');
var findObjInArray = require('../../../_utils').findObjInArray;

test('request', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 2);
    t.strictEqual(data.spans.length, 1);

    var sub = data.transactions[0];
    t.strictEqual(sub.name, 'GET /test');

    var root = data.transactions[1];
    t.strictEqual(root.name, 'GET /');
    t.strictEqual(root.outcome, 'success');
    const span = findObjInArray(data.spans, 'transaction_id', root.id);
    t.strictEqual(span.outcome, 'success');
    t.strictEqual(span.name, 'GET localhost:' + server.address().port);

    server.close();
    t.end();
  });

  var app = express();
  var server = http.createServer(app);

  app.get('/test', (req, res) => {
    res.end('hello');
  });

  app.get('/', (req, res) => {
    request(`http://localhost:${req.socket.localPort}/test`).pipe(res);
  });

  sendRequest(server);
});

test('Outcome', function (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 2);
    t.strictEqual(data.spans.length, 1);

    var root = data.transactions[1];
    t.strictEqual(root.name, 'GET /');
    t.strictEqual(root.outcome, 'failure');
    const span = findObjInArray(data.spans, 'transaction_id', root.id);
    t.strictEqual(span.outcome, 'failure');
    t.strictEqual(span.name, 'GET localhost:' + server.address().port);

    server.close();
    t.end();
  });

  var app = express();
  var server = http.createServer(app);

  app.get('/test', (req, res) => {
    res.statusCode = 500;
    res.end('Bad Request');
  });

  app.get('/', (req, res) => {
    request(`http://localhost:${req.socket.localPort}/test`).pipe(res);
  });

  sendRequest(server);
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(3, cb);
}

function sendRequest(server, timeout) {
  server.listen(function () {
    var port = server.address().port;
    var req = http.get('http://localhost:' + port, function (res) {
      if (timeout) throw new Error('should not get to here');
      res.resume();
    });

    if (timeout) {
      process.nextTick(function () {
        req.abort();
      });
    }
  });
}
