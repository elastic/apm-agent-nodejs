/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const isRestifyIncompat = require('../_is_restify_incompat')();
if (isRestifyIncompat) {
  console.log(`# SKIP ${isRestifyIncompat}`);
  process.exit();
}

const { createAgentConfig } = require('./_shared');
const agent = require('../..').start(createAgentConfig());
const {
  resetAgent,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture,
  assertFormsWithFixture,
} = require('./_shared');
const test = require('tape');
const request = require('request');
const restify = require('restify');
const fixtures = require('./_fixtures');

test('Running fixtures with restify', function (suite) {
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

function createMiddleware(type) {
  // restify's body parser does not (appear to?)
  // offer the ability to parse into anything
  // other than an object -- i.e. no "text"
  // or raw/Buffer options
  return restify.plugins.bodyParser();
}

function runTest(
  t,
  expected,
  agentConfig,
  requestHeaders,
  responseHeaders,
  formFields,
  middleware = false,
) {
  // register a listener to close the server when we're done
  const done = () => {
    server.close();
  };
  t.on('end', done);

  // configure agent and instantiated new app
  agent._config(agentConfig);
  const server = restify.createServer();
  if (middleware) {
    server.use(middleware);
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
  server.post('/test', function (req, res, next) {
    t.ok('received request', 'received request');
    for (const [header, value] of Object.entries(responseHeaders)) {
      res.header(header, value);
    }
    res.send('Hello World');
    next();
  });

  server.listen(0, '0.0.0.0', () => {
    const url = `${server.url}/test`;
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
}
