/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const http = require('http');
const querystring = require('querystring');
const mockClient = require('../_mock_http_client');

const REDACTED = '[REDACTED]';
/**
 * Checks that request header payload data meets expectations of test fixtures
 */
function assertRequestHeadersWithFixture(transaction, expected, t) {
  // assert request headers here
  for (const [header, value] of Object.entries(
    expected.requestHeaders.defined,
  )) {
    t.ok(
      transaction.context.request.headers[header.toLowerCase()],
      `header "${header}" is still set`,
    );
    t.equals(
      transaction.context.request.headers[header.toLowerCase()],
      value,
      `key "${header}" has correct value`,
    );
  }
  for (const [, header] of expected.requestHeaders.undefined.entries()) {
    t.equals(
      transaction.context.request.headers[header.toLowerCase()],
      REDACTED,
      `header "${header}" is redacted`,
    );
  }
}

/**
 * Checks that response header payload data meets expectations of test fixtures
 */
function assertResponseHeadersWithFixture(transaction, expected, t) {
  // assert response headers here
  for (const [header, value] of Object.entries(
    expected.responseHeaders.defined,
  )) {
    t.ok(
      transaction.context.response.headers[header.toLowerCase()],
      `header "${header}" is still set`,
    );
    t.equals(
      transaction.context.response.headers[header.toLowerCase()],
      value,
      `key "${header}" has correct value`,
    );
  }
  for (const [, header] of expected.responseHeaders.undefined.entries()) {
    t.equals(
      transaction.context.response.headers[header.toLowerCase()],
      REDACTED,
      `header "${header}" is redacted`,
    );
  }
}

/**
 * Checks that form data payload data meets expectations of test fixtures
 */
function assertFormsWithFixture(transaction, expected, t) {
  // assert post/body headers here
  const bodyAsObject = getBodyAsObject(transaction.context.request.body);
  for (const [key, value] of Object.entries(expected.formFields.defined)) {
    t.ok(bodyAsObject[key], `key "${key}" is still set`);
    t.equals(bodyAsObject[key], value, `key "${key}" has correct value`);
  }
  for (const [, key] of expected.formFields.undefined.entries()) {
    t.equals(bodyAsObject[key], REDACTED, `key "${key}" is redacted`);
  }
}

function resetAgent(agent, cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
  agent.captureError = function (err) {
    throw err;
  };
}

function createAgentConfig(values = {}) {
  const defaultAgentConfig = {
    serviceName: 'test',
    secretToken: 'test',
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    captureBody: 'all',
    apmServerVersion: '8.17.0',
  };

  const agentConfig = Object.assign(values, defaultAgentConfig);
  return agentConfig;
}

/**
 * Attempts to parse a string first as JSON, then as a query string
 */
function getBodyAsObject(string) {
  if (!string) {
    return {};
  }
  try {
    return JSON.parse(string);
  } catch (e) {
    return querystring.parse(string);
  }
}

/**
 * Convenience function to make an form-encoded HTTP POST request and callback
 * with the body, `cb(null, res, body)`.
 */
function requestPost(url, headers, form, cb) {
  const u = new URL(url);
  const req = http.request(
    {
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: Object.assign(
        { 'content-type': 'application/x-www-form-urlencoded' },
        headers,
      ),
    },
    (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        cb(null, res, body);
      });
    },
  );
  req.write(querystring.encode(form));
  req.end();
}

module.exports = {
  createAgentConfig,
  getBodyAsObject,
  requestPost,
  resetAgent,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture,
  assertFormsWithFixture,
};
