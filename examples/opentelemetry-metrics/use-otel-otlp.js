/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses the OTel Metrics SDK and API, reads metrics every 5s, and
// exports Elastic APM via OTLP/gRPC.

'use strict'

const SERVICE_NAME = 'use-otel-otlp'

const otel = require('@opentelemetry/api')
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc') // OTLP/gRPC
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // XXX get some OTel diagnostic logging

// XXX
// process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = `Authorization=Bearer ${CONFIG.secretToken}`
// const metricExporter = new OTLPMetricExporter({ url: CONFIG.serverUrl })

const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development'
  })
})
meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter(),
  exportIntervalMillis: 5000,
  exportTimeoutMillis: 1000
}))
otel.metrics.setGlobalMeterProvider(meterProvider)

const meter = otel.metrics.getMeter('my-meter')

const counter = meter.createCounter('my_counter', { description: 'My Counter' })

let n = 0
const asyncCounter = meter.createObservableCounter('my_async_counter', { description: 'My Asynchronous Counter' })
asyncCounter.addCallback(observableResult => {
  observableResult.observe(n)
})

setInterval(() => {
  n++
  counter.add(1)
}, 1000)
