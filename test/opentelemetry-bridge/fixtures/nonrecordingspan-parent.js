/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Expect:
//   transaction "s2" (trace_id=d4cda95b652f4a1592b449dd92ffda3b, parent_id=6e0c63ffe4e34c42)

// This tests a case where the `Span` set on a Context is *not* an object
// created by the OTel Bridge code. Instead it is a `NonRecordingSpan` object
// created by `@opentelemetry/api` itself via: `otel.trace.wrapSpanContext()`.
//
// A practical use case is where user code is handling continuing a trace
// from manually extracted trace-context data. For example for bulk message
// reception: https://www.elastic.co/guide/en/apm/agent/nodejs/current/message-queues.html#message-queues-distributed-tracing

const assert = require('assert');
const otel = require('@opentelemetry/api');
const {
  TraceState,
} = require('../../../lib/opentelemetry-bridge/opentelemetry-core-mini/trace/TraceState');

const tracer = otel.trace.getTracer('test-nonrecordingspan-parent');

// This creates a span `s1` that is a `NonRecordingSpan` -- an internal class
// in `@opentelemetry/api`. Notably, it isn't an `OTelSpan` instance created
// by our registered global Tracer.
const parentSpanContext = {
  traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
  spanId: '6e0c63ffe4e34c42',
  traceFlags: otel.TraceFlags.SAMPLED,
  traceState: new TraceState('foo=bar'),
};
const s1 = otel.trace.wrapSpanContext(parentSpanContext); // A "SAMPLED", but non-recording span.
assert(s1.isRecording() === false, 's1 is non-recording');
assert(s1.spanContext().traceFlags & otel.TraceFlags.SAMPLED, 's1 is sampled');

// Then we use that NonRecordingSpan to test that the OTelBridge correctly
// propagates its SpanContext.
otel.context.with(otel.trace.setSpan(otel.context.active(), s1), () => {
  const s2 = tracer.startSpan('s2');
  assert(s2.isRecording(), 's2 is recording');
  assert.strictEqual(
    s2.spanContext().traceId,
    parentSpanContext.traceId,
    's2 traceId inherited from s1',
  );
  assert(
    s2.spanContext().traceFlags & otel.TraceFlags.SAMPLED,
    's2 is sampled',
  );
  assert.strictEqual(
    s2.spanContext().traceState.get('foo'),
    'bar',
    's2 tracestate inherited from s1',
  );
  assert.strictEqual(
    s2.parentSpanId /* OTel SDK */ || s2._span.parentId /* Elastic APM */,
    parentSpanContext.spanId,
    's2 parent is s1',
  );
  s2.end();
});
