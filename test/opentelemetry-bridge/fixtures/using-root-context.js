/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Expect:
//   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)

// This tests context propagation with direct usage of `otel.ROOT_CONTEXT`.
//
// This is an "interesting" case to test because `otel.ROOT_CONTEXT` and
// `Context` objects derived from it are a class implemented in
// `@opentelemetry/api` that cannot be overriden. This is as opposed to
// `Context` objects derived from `api.context.active()` -- which calls into
// the global ContextManager for creation.

const assert = require('assert');
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('test-using-root-context');

const parentSpanContext = {
  traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
  spanId: '6e0c63ffe4e34c42',
  traceFlags: otel.TraceFlags.SAMPLED,
};
const s1 = otel.trace.wrapSpanContext(parentSpanContext);

let ctx;
ctx = otel.trace.setSpan(otel.ROOT_CONTEXT, s1); // -> BaseContext

// Also set an arbitrary value on the Context to test that it is properly
// propagated.
const FOO_KEY = otel.createContextKey('foo');
ctx = ctx.setValue(FOO_KEY, 'bar');

otel.context.with(ctx, () => {
  assert.strictEqual(
    otel.context.active().getValue(FOO_KEY),
    'bar',
    'the active context has our FOO_KEY value',
  );

  const s2 = tracer.startSpan('s2');
  assert(s2.isRecording() === true, 's2 is recording');
  assert.strictEqual(
    s2.spanContext().traceId,
    parentSpanContext.traceId,
    's2 traceId inherited from s1',
  );
  assert.strictEqual(
    s2.parentSpanId /* OTel SDK */ || s2._span.parentId /* Elastic APM */,
    parentSpanContext.spanId,
    's2 parent is s1',
  );
  s2.end();
});
