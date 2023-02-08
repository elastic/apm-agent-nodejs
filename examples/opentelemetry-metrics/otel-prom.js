/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses the OTel Metrics SDK and API to export metrics to Prometheus.
//    http://localhost:3001/metrics

'use strict'

const PORT = 3001
const SERVICE_NAME = 'otelmetrics-otel-prom'

const otel = require('@opentelemetry/api')
const { MeterProvider } = require('@opentelemetry/sdk-metrics')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
// XXX
otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging

const exporter = new PrometheusExporter({ host: 'localhost', port: PORT })
const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME
  })
})
meterProvider.addMetricReader(exporter)
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
