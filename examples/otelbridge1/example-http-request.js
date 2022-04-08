// Based on https://github.com/open-telemetry/opentelemetry-js/blob/main/examples/http/client.js
'use strict'
const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('example-http-request')

const http = require('http')

function makeRequest () {
  const span = tracer.startSpan('makeRequest')
  otel.context.with(otel.trace.setSpan(otel.context.active(), span), () => {
    http.get({
      host: 'httpstat.us',
      path: '/200',
      headers: { accept: '*/*' }
    }, (response) => {
      console.log('STATUS:', response.statusCode)
      const body = []
      response.on('data', (chunk) => body.push(chunk))
      response.on('end', () => {
        console.log('BODY:', body.toString())
        span.end()
      })
    })
  })
}

makeRequest()
