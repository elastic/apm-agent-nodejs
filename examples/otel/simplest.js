'use strict'

// A simple OTel API-using script.
// Usage:
//    node -r ./otel-tracing.js simplest.js                      // using the OTel JS SDK
//    node -r elastic-apm-node/opentelemetry-sdk.js simplest.js  // using Elastic APM

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('simplest')
function makeRequest () {
  const span = tracer.startSpan('makeRequest')
  span.end()
}
makeRequest()
