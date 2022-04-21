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

// const s = tracer.startSpan('mySpan')

// const spanContext = s.spanContext()
// assert.ok(otel.trace.isSpanContextValid(spanContext), 'spanContext is valid')
// assert.strictEqual(spanContext.traceFlags, otel.TraceFlags.SAMPLED, 'spanContext.traceFlags')
// XXX test traceState on spanContext

// s.end()
