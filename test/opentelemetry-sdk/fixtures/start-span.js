// Expect:
//   transaction "mySpan"

'use strict'
let assert = require('assert')
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict
}
const eapm = require('../../..')
const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('test-simple')

const s = tracer.startSpan('mySpan')

// OTel's startSpan does *not* make the span active/current.
assert.ok(otel.trace.getSpan(otel.context.active()) === undefined, 'no active span (OTel API)')
assert.ok(eapm.currentTransaction === null, 'no active transaction (Elastic API)')

s.end()
