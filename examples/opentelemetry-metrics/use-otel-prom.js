/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses the OTel Metrics SDK and API to export metrics to Prometheus.
//    http://localhost:3001/metrics

'use strict'

const PROM_PORT = process.env.PROM_PORT || 3002
const SERVICE_NAME = process.env.ELASTIC_APM_SERVICE_NAME || 'use-otel-prom'

const otel = require('@opentelemetry/api')
const { MeterProvider } = require('@opentelemetry/sdk-metrics')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // XXX get some OTel diagnostic logging

const exporter = new PrometheusExporter({ host: 'localhost', port: PROM_PORT })
const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME
  })
})
meterProvider.addMetricReader(exporter)
otel.metrics.setGlobalMeterProvider(meterProvider)
console.log(`Prometheus metrics at http://localhost:${PROM_PORT}/metrics`)

const meter = otel.metrics.getMeter('my-meter')

const counter = meter.createCounter('my_counter', { description: 'My Counter' })

let n = 0
const asyncCounter = meter.createObservableCounter('my_async_counter', { description: 'My Asynchronous Counter' })
asyncCounter.addCallback(observableResult => {
  observableResult.observe(n)
})

const asyncGauge = meter.createObservableGauge('my_async_gauge', { description: 'My Asynchronous Gauge' })
asyncGauge.addCallback(observableResult => {
  // A sine wave with a 5 minute period, to have a recognizable pattern.
  observableResult.observe(Math.sin(Date.now() / 1000 / 60 / 5 * (2 * Math.PI)))
})

const upDownCounter = meter.createUpDownCounter('my_updowncounter', { description: 'My UpDownCounter' })

let c = 0
const asyncUpDownCounter = meter.createObservableUpDownCounter('my_async_updowncounter', { description: 'My Asynchronous UpDownCounter' })
asyncUpDownCounter.addCallback(observableResult => {
  observableResult.observe(c)
})

setInterval(() => {
  n++
  counter.add(1)
  if (new Date().getUTCSeconds() < 30) {
    c++
    upDownCounter.add(1)
  } else {
    c--
    upDownCounter.add(-1)
  }
}, 1000)
