/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/* eslint-disable */

'use strict'


var SERVER_URL = 'http://localhost:8200'
var SECRET_TOKEN = '[REDACTED]' // <--- secret_token here



const otel = require('@opentelemetry/api')
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging

// Pick one of the three OTLP flavours. This example uses OTLP/gRPC.
// (Note: How to pass in the URL and auth header is finnicky -- it differs for the
// different flavours. See "metrics-exporter-play.js" for details.)
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc'); // OTLP/gRPC
process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = `Authorization=Bearer ${SECRET_TOKEN}`
const metricExporter = new OTLPMetricExporter({ url: SERVER_URL })

const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'use-otel-metrics-otlp-exporter',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development'
  })
})
meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 3000,
  exportTimeoutMillis: 1000
}))
otel.metrics.setGlobalMeterProvider(meterProvider)


// Create some metrics.
const meter = otel.metrics.getMeter('use-otel-metrics')
const counter = meter.createCounter('test_counter', {
  description: 'Example of a Counter'
})
const upDownCounter = meter.createUpDownCounter('test_up_down_counter', {
  description: 'Example of a UpDownCounter'
})
const histogram = meter.createHistogram('test_histogram', {
  description: 'Example of a Histogram'
})
const attributes = { pid: process.pid, environment: 'staging' }
setInterval(() => {
  counter.add(1, attributes)
  upDownCounter.add(Math.random() > 0.5 ? 1 : -1, attributes)
  histogram.record(Math.random() * 1000, attributes)
}, 1000)
