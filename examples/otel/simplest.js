'use strict'

// A simple OTel API-using script.

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('simplest')
function makeRequest () {
  const span = tracer.startSpan('makeRequest')
  span.end()
}
makeRequest()
