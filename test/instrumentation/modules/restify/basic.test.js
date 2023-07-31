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

const isRestifyIncompat = require('../../../_is_restify_incompat')();
if (isRestifyIncompat) {
  console.log(`# SKIP ${isRestifyIncompat}`);
  process.exit();
}

const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

const http = require('http');

const once = require('once');
const restify = require('restify');
const test = require('tape');

const mockClient = require('../../../_mock_http_client');

test('transaction name', function (t) {
  t.plan(5);

  resetAgent((data) => {
    t.strictEqual(data.transactions.length, 1, 'has a transaction');

    const trans = data.transactions[0];
    t.strictEqual(
      trans.name,
      'GET /hello/:name',
      'transaction name is GET /hello/:name',
    );
    t.strictEqual(trans.type, 'request', 'transaction type is request');
  });

  const server = restify.createServer();
  const done = once(() => {
    server.close();
    t.end();
  });
  t.on('end', done);

  server.get('/hello/:name', (req, res, next) => {
    res.send({
      message: 'hello ' + req.params.name,
    });
    next();
  });

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(0, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, (res) => {
      t.strictEqual(
        res.statusCode,
        200,
        'server should respond with status code 200',
      );
      const chunks = [];
      res.on('data', chunks.push.bind(chunks));
      res.on('end', () => {
        const result = Buffer.concat(chunks).toString();
        const json = JSON.parse(result);
        t.deepEqual(
          json,
          {
            message: 'hello world',
          },
          'got correct body',
        );
        agent.flush();
        done();
      });
    });
    req.end();
  });
});

test('error reporting', function (t) {
  t.plan(8);

  resetAgent((data) => {
    t.ok(errored, 'reported an error');
    t.strictEqual(data.transactions.length, 1, 'has a transaction');

    const trans = data.transactions[0];
    t.strictEqual(
      trans.name,
      'GET /hello/:name',
      'transaction name is GET /hello/:name',
    );
    t.strictEqual(trans.type, 'request', 'transaction type is request');
  });

  let request;
  let errored = false;
  const error = new Error('wat');
  const captureError = agent.captureError;
  agent.captureError = function (err, data) {
    t.strictEqual(err, error, 'has the expected error');
    t.ok(data, 'captured data with error');
    t.strictEqual(
      data.request,
      request,
      'captured data has the request object',
    );
    errored = true;
  };
  t.on('end', function () {
    agent.captureError = captureError;
  });

  const server = restify.createServer();
  const done = once(() => {
    server.close();
    t.end();
  });
  t.on('end', done);

  server.get('/hello/:name', (req, res, next) => {
    request = req;
    next(error);
  });

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(0, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, (res) => {
      t.strictEqual(
        res.statusCode,
        500,
        'server should respond with status code 500',
      );
      res.resume();
      res.on('end', () => {
        agent.flush();
        done();
      });
    });
    req.end();
  });
});

test('error reporting from chained handler', function (t) {
  t.plan(8);

  resetAgent((data) => {
    t.ok(errored, 'reported an error');
    t.strictEqual(data.transactions.length, 1, 'has a transaction');

    const trans = data.transactions[0];
    t.strictEqual(
      trans.name,
      'GET /hello/:name',
      'transaction name is GET /hello/:name',
    );
    t.strictEqual(trans.type, 'request', 'transaction type is request');
  });

  let request;
  let errored = false;
  const error = new Error('wat');
  const captureError = agent.captureError;
  agent.captureError = function (err, data) {
    t.strictEqual(err, error, 'has the expected error');
    t.ok(data, 'captured data with error');
    t.strictEqual(
      data.request,
      request,
      'captured data has the request object',
    );
    errored = true;
  };
  t.on('end', function () {
    agent.captureError = captureError;
  });

  const server = restify.createServer();
  const done = once(() => {
    server.close();
    t.end();
  });
  t.on('end', done);

  server.get(
    '/hello/:name',
    (req, res, next) => {
      next();
    },
    (req, res, next) => {
      request = req;
      next(error);
    },
  );

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(0, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, (res) => {
      t.strictEqual(
        res.statusCode,
        500,
        'server should respond with status code 500',
      );
      res.resume();
      res.on('end', () => {
        agent.flush();
        done();
      });
    });
    req.end();
  });
});

test('error reporting from chained handler given as array', function (t) {
  t.plan(8);

  resetAgent((data) => {
    t.ok(errored, 'reported an error');
    t.strictEqual(data.transactions.length, 1, 'has a transaction');

    const trans = data.transactions[0];
    t.strictEqual(
      trans.name,
      'GET /hello/:name',
      'transaction name is GET /hello/:name',
    );
    t.strictEqual(trans.type, 'request', 'transaction type is request');
  });

  let request;
  let errored = false;
  const error = new Error('wat');
  const captureError = agent.captureError;
  agent.captureError = function (err, data) {
    t.strictEqual(err, error, 'has the expected error');
    t.ok(data, 'captured data with error');
    t.strictEqual(
      data.request,
      request,
      'captured data has the request object',
    );
    errored = true;
  };
  t.on('end', function () {
    agent.captureError = captureError;
  });

  const server = restify.createServer();
  const done = once(() => {
    server.close();
    t.end();
  });
  t.on('end', done);

  server.use([
    function (req, res, next) {
      next();
    },
    function (req, res, next) {
      request = req;
      next(error);
    },
  ]);

  // It's important to have the route registered. Otherwise the request will
  // not reach the middleware above and will just be ended with a 404
  server.get('/hello/:name', (req, res, next) => {
    t.fail('should never call route handler');
  });

  // NOTE: Hostname must be supplied to force IPv4 mode,
  // otherwise this will use IPv6, which fails on Travis CI.
  server.listen(0, '0.0.0.0', function () {
    const req = http.get(`${server.url}/hello/world`, (res) => {
      t.strictEqual(
        res.statusCode,
        500,
        'server should respond with status code 500',
      );
      res.resume();
      res.on('end', () => {
        agent.flush();
        done();
      });
    });
    req.end();
  });
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
