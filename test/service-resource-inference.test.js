/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test cases from the cross-agent "json-specs/service_resource_inference.json"
// from apm.git.

const { CapturingTransport } = require('./_capturing_transport');
const apm = require('..').start({
  serviceName: 'test-service-resource-inference',
  logUncaughtExceptions: true,
  metricsInterval: '0s',
  centralConfig: false,
  logLevel: 'off',
  spanCompressionEnabled: false,
  transport() {
    return new CapturingTransport();
  },
});

const test = require('tape');
const { URL } = require('url');

test('setup: current trans', (t) => {
  apm.startTransaction('aTrans', 'manual');
  t.end();
});

var testData = require('./fixtures/json-specs/service_resource_inference.json');
testData.forEach((testDatum) => {
  test(testDatum.failure_message, (t) => {
    // 1. Create a span according to `testDatum.span`.
    const spanOpts = {
      exitSpan: testDatum.span.exit === 'true',
    };
    const span = apm.startSpan(
      'aSpan',
      testDatum.span.type,
      testDatum.span.subtype,
      spanOpts,
    );
    if (testDatum.span.context) {
      if (testDatum.span.context.db) {
        span.setDbContext(testDatum.span.context.db);
      }
      if (testDatum.span.context.http) {
        // service_resource_inference.json oddly provides context.http.url as
        // an object with "host" and "port" fields, rather than as a URL string
        // as accepted by the intake API. So we need to construct it.
        const httpContext = Object.assign({}, testDatum.span.context.http);
        if (httpContext.url) {
          const u = new URL('', 'http://example.com');
          if (httpContext.url.host) {
            u.hostname = httpContext.url.host;
          }
          if (httpContext.url.port) {
            u.port = httpContext.url.port;
          }
          httpContext.url = u.href;
        }
        span.setHttpContext(httpContext);
      }
      if (testDatum.span.context.message) {
        span.setMessageContext(testDatum.span.context.message);
      }
      if (
        testDatum.span.context.service &&
        testDatum.span.context.service.target
      ) {
        span.setServiceTarget(
          testDatum.span.context.service.target.type,
          testDatum.span.context.service.target.name,
        );
      }
    }
    span.end();

    // 2. Then assert that it has the expected destination.service.resource and
    //    service.target.
    apm.flush(() => {
      const spanPayload = apm._apmClient.spans.pop();
      if (testDatum.expected_resource === null) {
        t.ok(
          !(
            spanPayload.context &&
            spanPayload.context.destination &&
            spanPayload.context.destination.service
          ),
          'no span.context.destination.service.resource',
        );
      } else {
        t.equal(
          spanPayload.context.destination.service.resource,
          testDatum.expected_resource,
          'span.context.destination.service.resource',
        );
      }
      if (testDatum.expected_service_target === null) {
        t.ok(
          !(
            spanPayload.context &&
            spanPayload.context.service &&
            spanPayload.context.service.target
          ),
          'no span.context.service.target',
        );
      } else {
        t.deepEqual(
          spanPayload.context.service.target,
          testDatum.expected_service_target,
          'span.context.service.target',
        );
      }
      t.end();
    });
  });
});

test('teardown', (t) => {
  apm.endTransaction();
  t.end();
});
