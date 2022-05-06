'use strict'

// A simple OpenTelemetry API-using script.

const otel = require('@opentelemetry/api')

const tracer = otel.trace.getTracer('hello-world')

function main () {
  tracer.startActiveSpan('hi', span => {
    console.log('hello')
    span.end()
  })
  tracer.startActiveSpan('bye', span => {
    console.log('goodbye')
    span.end()
  })
}

tracer.startActiveSpan('main', span => {
  main()
  span.end()
})
