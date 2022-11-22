/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Example usage of vanilla OTel libs to show exporting Prometheus metrics.

const otel = require('@opentelemetry/api')
const { MeterProvider } = require('@opentelemetry/sdk-metrics')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging

// This exports Prometheus-format metrics at http://localhost:9464/metrics
const exporter = new PrometheusExporter({ host: 'localhost' })
const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'otel-metrics-poc',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development'
  })
})
meterProvider.addMetricReader(exporter)
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
