/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test interoperation of active spans and context between the Agent API and
// the OTel API. Cases are described here:
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-api-otel.md#active-spans-and-context

const apm = require('../..').start({
  opentelemetryBridgeEnabled: true,
  // Make the agent quiet.
  disableSend: true,
  centralConfig: false,
  cloudProvider: 'none',
  metricsInterval: '0s',
  captureExceptions: false,
  logLevel: 'off',
});

const otel = require('@opentelemetry/api');
const semver = require('semver');
const tape = require('tape');

const supportsGetActiveSpan = semver.satisfies(
  require('@opentelemetry/api/package.json').version,
  '>=1.2.0',
);

const tracer = otel.trace.getTracer();

function parentIdFromOTelSpan(span) {
  return (
    span.parentSpanId || // OTel SDK
    (span._span && span._span.parentId) || // Elastic APM
    undefined
  );
}
function idFromOTelSpan(span) {
  return span.spanContext().spanId;
}

// After activating an Elastic span via the agent's API, the Context returned
// via the get current context API should contain that Elastic span
tape.test('curr Elastic span is contained in OTel Context', (t) => {
  const t1 = apm.startTransaction('t1');
  const otelSpan = otel.trace.getSpan(otel.context.active());
  t.strictEqual(
    otelSpan._span,
    t1,
    'active OTel span contains the Elastic API-started transaction',
  );

  if (supportsGetActiveSpan) {
    // Also test the `otel.trace.getActiveSpan()` added in @opentelemetry/api@1.2.0.
    t.strictEqual(
      otel.trace.getActiveSpan()._span,
      t1,
      'active OTel span (retrieved from getActiveSpan()) contains the Elastic API-started transaction',
    );
  }

  t1.end();
  t.end();
});

// When an OTel context is attached (aka activated), the get current context API
// should return the same Context instance.
tape.test('OTel context attachment works', (t) => {
  const KEY = otel.createContextKey('myKey');
  const ctx = otel.context.active().setValue(KEY, 'foo');
  otel.context.with(ctx, function () {
    t.strictEqual(
      otel.context.active(),
      ctx,
      'active context is the same Context instance as was activated',
    );
    t.strictEqual(otel.context.active().getValue(KEY), 'foo');
    t.end();
  });
});

// Starting an OTel span in the scope of an active Elastic span should make the
// OTel span a child of the Elastic span.
tape.test('OTel span in an Elastic span', (t) => {
  const t3 = apm.startTransaction('t3');
  const s3 = tracer.startSpan('s3');
  t.strictEqual(
    parentIdFromOTelSpan(s3),
    t3.id,
    'OTel span created in context of Elastic transaction is a child of it',
  );
  s3.end();
  t3.end();
  t.end();
});

// Starting an Elastic span in the scope of an active OTel span should make the
// Elastic span a child of the OTel span.
tape.test('Elastic span in an OTel span', (t) => {
  tracer.startActiveSpan('t4', (t4) => {
    const s4 = apm.startSpan('s4');
    t.strictEqual(
      s4.parentId,
      idFromOTelSpan(t4),
      'Elastic span created in context of OTel span is a child of it',
    );
    s4.end();
    t4.end();
    t.end();
  });
});
