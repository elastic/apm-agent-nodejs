/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const { createAgentConfig } = require('./_shared');
const agent = require('../..').start(createAgentConfig());

const isFastifyIncompat = require('../_is_fastify_incompat')();
if (isFastifyIncompat) {
  console.log(`# SKIP ${isFastifyIncompat}`);
  process.exit();
}

const {
  resetAgent,
  assertFormsWithFixture,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture,
} = require('./_shared');
const test = require('tape');
const request = require('request');
const fastify = require('fastify');
const fastifyFormbody = require('@fastify/formbody');
const fixtures = require('./_fixtures');

function runTest(
  t,
  expected,
  agentConfig,
  requestHeaders,
  responseHeaders,
  formFields,
  middleware = false,
) {
  agent._config(agentConfig);
  const app = fastify();
  if (middleware) {
    app.register(middleware);
  }

  // resets agent values for tests.  Callback fires
  // after mockClient receives data
  resetAgent(agent, (data) => {
    const transaction = data.transactions.pop();
    assertRequestHeadersWithFixture(transaction, expected, t);
    assertResponseHeadersWithFixture(transaction, expected, t);
    assertFormsWithFixture(transaction, expected, t);
  });

  // register request handler
  app.post('/test', (req, reply) => {
    t.ok('received request', 'received request');
    for (const [header, value] of Object.entries(responseHeaders)) {
      reply.header(header, value);
    }
    reply.send('Hello World');
  });

  app.listen({ port: 0, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      throw err;
    }
    const url = `${address}/test`;
    request.post(
      url,
      {
        form: formFields,
        headers: requestHeaders,
      },
      function (error, response, body) {
        if (error) {
          t.fail(error);
        }
        t.ok(body, 'received response');
        t.end();
      },
    );
  });

  const done = () => {
    app.close();
  };
  t.on('end', done);
}

function createMiddleware(type) {
  // fastify only has the one body parsing middleware
  // there's no text or raw/Buffer to worry about
  return fastifyFormbody;
}

test('Running fixtures with fastify', function (suite) {
  for (const [, fixture] of fixtures.entries()) {
    test(fixture.name, function (t) {
      runTest(
        t,
        fixture.expected,
        createAgentConfig(fixture.agentConfig),
        fixture.input.requestHeaders,
        fixture.input.responseHeaders,
        fixture.input.formFields,
        createMiddleware(fixture.bodyParsing),
      );
    });
  }
  suite.end();
});
