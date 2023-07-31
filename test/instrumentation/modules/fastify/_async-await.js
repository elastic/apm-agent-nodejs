/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const http = require('http');

const Fastify = require('fastify');
const semver = require('semver');
const test = require('tape');

const fastifyVersion = require('fastify/package').version;

const agent = require('../../../..');
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

  const fastify = Fastify();

  fastify.get('/hello/:name', async (request, reply) => {
    return { hello: request.params.name };
  });

  fastify.listen({ port: 0 }, function (err, address) {
    t.error(err);
    address = 'http://localhost:' + fastify.server.address().port;
    http.get(`${address}/hello/world`, function (res) {
      const chunks = [];
      res.on('data', chunks.push.bind(chunks));
      res.on('end', function () {
        const result = Buffer.concat(chunks).toString();
        t.strictEqual(result, '{"hello":"world"}', 'got correct body');
        agent.flush();
        fastify.close();
        t.end();
      });
    });
  });
});

if (semver.gte(fastifyVersion, '2.0.0-rc')) {
  test('error reporting', function (t) {
    t.plan(9);

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

    const fastify = Fastify();

    fastify.get('/hello/:name', async (_request, reply) => {
      request = _request.raw;
      throw error;
    });

    fastify.listen({ port: 0 }, function (err, address) {
      t.error(err);
      http.get(
        `http://localhost:${fastify.server.address().port}/hello/world`,
        function (res) {
          const chunks = [];
          res.on('data', chunks.push.bind(chunks));
          res.on('end', function () {
            const result = JSON.parse(Buffer.concat(chunks).toString());
            t.deepEqual(
              result,
              {
                error: 'Internal Server Error',
                message: 'wat',
                statusCode: 500,
              },
              'got correct body',
            );
            agent.flush();
            fastify.close();
            t.end();
          });
        },
      );
    });
  });
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
