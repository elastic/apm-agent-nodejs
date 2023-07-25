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
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
});

var http = require('http');

var express = require('express');
var finalhandler = require('finalhandler');
var test = require('tape');

var mockClient = require('../../_mock_http_client');

function makeTest(makeServer) {
  return function (t) {
    t.plan(7);

    resetAgent(function (data) {
      t.strictEqual(data.transactions.length, 1, 'has a transaction');

      var trans = data.transactions[0];
      t.strictEqual(trans.name, 'GET /', 'transaction name is GET /');
      t.strictEqual(trans.type, 'request', 'transaction type is request');
    });

    var request;
    var error = new Error('wat');
    var captureError = agent.captureError;
    agent.captureError = function (err, data) {
      t.strictEqual(err, error, 'has the expected error');
      t.ok(data, 'captured data with error');
      t.strictEqual(
        data.request,
        request,
        'captured data has the request object',
      );
    };
    t.on('end', function () {
      agent.captureError = captureError;
    });

    var server = makeServer(error, (req) => {
      request = req;
    });

    server.listen(function () {
      var port = server.address().port;
      http.get(`http://localhost:${port}`, (res) => {
        t.strictEqual(res.statusCode, 500);
        res.resume();
        res.on('end', () => {
          server.close();
          agent.flush();
        });
      });
    });
  };
}

test(
  'basic http',
  makeTest((error, setRequest) => {
    return http.createServer((req, res) => {
      var done = finalhandler(req, res);
      agent.setTransactionName('GET /');
      setRequest(req);
      done(error);
    });
  }),
);

test(
  'express done',
  makeTest((error, setRequest) => {
    var app = express();

    app.get('/', (req, res, next) => {
      setRequest(req);
      next(error);
    });

    return http.createServer(app);
  }),
);

test(
  'express throw',
  makeTest((error, setRequest) => {
    var app = express();

    app.get('/', (req, res, next) => {
      setRequest(req);
      throw error;
    });

    return http.createServer(app);
  }),
);

test(
  'express with error handler',
  makeTest((error, setRequest) => {
    var app = express();

    app.get('/', (req, res, next) => {
      setRequest(req);
      next(error);
    });

    app.use((error, req, res, next) => {
      res.status(500).json({ error: error.message });
    });

    return http.createServer(app);
  }),
);

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
  agent.captureError = function (err) {
    throw err;
  };
}
