/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

require('../..').start({
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
const tape = require('tape');
const { OTelBridgeRunContext } = require('../../lib/opentelemetry-bridge');

const tracer = otel.trace.getTracer();
const FOO_KEY = otel.createContextKey('foo');

function parentIdFromSpan(span) {
  return (
    span.parentSpanId || // OTel SDK
    (span._span && span._span.parentId) || // Elastic APM
    undefined
  );
}

tape.test('OTelBridgeRunContext', (t) => {
  const ctx = otel.context.active();
  t.ok(ctx instanceof OTelBridgeRunContext);

  const ctx2 = ctx.setValue(FOO_KEY, 'bar');
  t.ok(ctx2 !== ctx, 'setValue returns a new instance');
  t.equal(ctx2.getValue(FOO_KEY), 'bar');
  t.equal(ctx.getValue(FOO_KEY), undefined);

  const ctx3 = ctx2.deleteValue(FOO_KEY);
  t.ok(ctx3 !== ctx2, 'deleteValue returns a new instance');
  t.equal(ctx3.getValue(FOO_KEY), undefined);
  t.equal(ctx2.getValue(FOO_KEY), 'bar');

  t.end();
});

// The point of OTelBridgeRunContext is to specially handle getting/setting
// the active span via the span key (a Symbol), so we should test the code
// paths for that. `setValue(SPAN_KEY, ...)` and `getValue(SPAN_KEY)` are well
// tested in other tests. That leaves `deleteValue(SPAN_KEY)`
tape.test('OTelBridgeRunContext.deleteValue(SPAN_KEY)', (t) => {
  tracer.startActiveSpan('s1', (s1) => {
    let ctx = otel.context.active();
    ctx = ctx.setValue(FOO_KEY, 'bar');
    ctx = otel.trace.deleteSpan(ctx); // this calls `ctx.deleteValue(SPAN_KEY)`
    t.equal(ctx.getValue(FOO_KEY), 'bar', 'FOO_KEY survived the deleteSpan');

    tracer.startActiveSpan('s2', {}, ctx, (s2) => {
      t.equal(parentIdFromSpan(s2), undefined, 's2 is not a child of s1');
      s2.end();
    });
    s1.end();
  });

  t.end();
});
