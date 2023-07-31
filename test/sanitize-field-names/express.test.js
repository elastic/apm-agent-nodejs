/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
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
const express = require('express');
const bodyParser = require('body-parser');
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
  const app = express();
  if (middleware) {
    app.use(middleware);
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
  app.post('/test', (req, res) => {
    t.ok('received request', 'received request');
    res.header(responseHeaders);
    res.send('Hello World');
  });

  const server = app.listen(0, '0.0.0.0', () => {
    const url = `http://${server.address().address}:${
      server.address().port
    }/test`;
    request.post(
      url,
      {
        form: formFields,
        headers: requestHeaders,
      },
      function (error, response, body) {
        t.error(error);
        t.ok(body, 'received response');
        t.end();
      },
    );
  });

  const done = () => {
    server.close();
  };
  t.on('end', done);
}

function createMiddleware(type) {
  if (type === 'urlencoded') {
    return bodyParser.urlencoded({ extended: false });
  } else if (type === 'text') {
    return bodyParser.text({ type: '*/*' });
  } else if (type === 'raw') {
    return bodyParser.raw({ type: '*/*' });
  }

  throw new Error(`I don't know how to create a ${type} middleware`);
}

test('Running fixtures with express', function (suite) {
  for (const [, fixture] of fixtures.entries()) {
    suite.test(fixture.name, function (t) {
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
