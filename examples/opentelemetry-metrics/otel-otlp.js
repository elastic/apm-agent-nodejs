/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses the OTel Metrics SDK and API, and exports metrics to Elastic
// via OTLP/gRPC every 5s.

'use strict'

const assert = require('assert')

// XXX Perhaps, similar to otelapi-elastic.js, pull this config out and do it via envvars to show the no-code usage of the Elastic APM agent for this.
const SERVICE_NAME = 'otelmetrics-otel-otlp'
const CONFIG = require('./elastic-apm-node')
assert(CONFIG.serverUrl)

const otel = require('@opentelemetry/api')
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging

const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc') // OTLP/gRPC
process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = `Authorization=Bearer ${CONFIG.secretToken}`
const metricExporter = new OTLPMetricExporter({ url: CONFIG.serverUrl })

const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME
  })
})
meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
  exportTimeoutMillis: 1000
}))
otel.metrics.setGlobalMeterProvider(meterProvider)

const meter = otel.metrics.getMeter('my-meter') // XXX what's this string used for?
const counter = meter.createCounter('test_counter', {
  description: 'A test Counter'
})
// const attributes = { pid: process.pid, environment: 'staging' } // XXX
setInterval(() => {
  counter.add(1)
  // counter.add(1, attributes)
}, 1000)

process.on('SIGTERM', () => {
  console.log('Bye (SIGTERM).')
  process.exit()
})
