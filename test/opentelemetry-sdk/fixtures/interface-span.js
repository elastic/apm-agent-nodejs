'use strict'

// Exercise the full `interface Span`.

const assert = require('assert')

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('test-interface-span')

// function parentIdFromSpan (span) {
//   return (
//     span.parentSpanId || // OTel SDK
//     (span._span && span._span.parentId) || // Elastic APM
//     undefined
//   )
// }
// function idFromSpan (span) {
//   return span.spanContext().spanId
// }

const sSpanContext = tracer.startSpan('sSpanContext')
const spanContext = sSpanContext.spanContext()
assert.ok(otel.trace.isSpanContextValid(spanContext), 'spanContext is valid')
assert.strictEqual(spanContext.traceFlags, otel.TraceFlags.SAMPLED, 'spanContext.traceFlags')
// XXX test traceState on spanContext
sSpanContext.end()
