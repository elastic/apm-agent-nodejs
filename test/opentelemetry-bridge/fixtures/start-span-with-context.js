/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Expect:
//   trace
//   `- transaction "s1"
//     `- span "s3"
//       `- span "s5"
//     `- transaction "s4"
//     `- span "s6"
//   trace
//   `- transaction "s2"

// Test `Tracer.startSpan(...)` with various cases for the `context` argument.

const assert = require('assert');

const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('test-start-span-with-context');

function parentIdFromSpan(span) {
  return (
    span.parentSpanId || // OTel SDK
    (span._span && span._span.parentId) || // Elastic APM
    undefined
  );
}
function idFromSpan(span) {
  return span.spanContext().spanId;
}

const s1 = tracer.startSpan('s1'); // Transaction 's1'
assert.strictEqual(parentIdFromSpan(s1), undefined, 's1 has no parent');

const s2 = tracer.startSpan('s2');
assert.strictEqual(parentIdFromSpan(s2), undefined, 's2 has no parent');
s2.end();

let ctx = otel.trace.setSpan(otel.context.active(), s1);
const s3 = tracer.startSpan('s3', {}, ctx);
assert.strictEqual(parentIdFromSpan(s3), idFromSpan(s1), 's3 is child of s1');
s3.end();

// Create a context via `setSpanContext`, which under the hood is quite
// different. The "span" set on ctx here is *not* s1, but is a NonRecordingSpan
// with its same trace-context details.
// Note: With the OTel Bridge, s4 becomes a *transaction* rather than a span.
ctx = otel.trace.setSpanContext(otel.context.active(), s1.spanContext());
const s4 = tracer.startSpan('s4', {}, ctx);
assert.strictEqual(parentIdFromSpan(s4), idFromSpan(s1), 's4 is child of s1');
s4.end();

// Creating context and child span after parent s3 (a span) has ended.
ctx = otel.trace.setSpan(otel.context.active(), s3);
const s5 = tracer.startSpan('s5', {}, ctx);
assert.strictEqual(parentIdFromSpan(s5), idFromSpan(s3), 's5 is child of s3');
s5.end();

s1.end();

// Creating context and child span after parent s1 (a transaction) has ended.
ctx = otel.trace.setSpan(otel.context.active(), s1);
const s6 = tracer.startSpan('s6', {}, ctx);
assert.strictEqual(parentIdFromSpan(s6), idFromSpan(s1), 's6 is child of s1');
s6.end();
