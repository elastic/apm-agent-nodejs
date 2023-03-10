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
const { MeterProvider, PeriodicExportingMetricReader, View, ExplicitBucketHistogramAggregation } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc') // OTLP/gRPC
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // XXX get some OTel diagnostic logging

// ---- support functions

// Standard Normal variate using Box-Muller transform.
// https://stackoverflow.com/a/36481059/14444044
function gaussianRandom (mean = 0, stdev = 1) {
  const u = 1 - Math.random() // Converting [0,1) to (0,1]
  const v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return z * stdev + mean // Transform to the desired mean and standard deviation.
}

// ---- mainline

const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development'
  }),
  views: [
    new View({
      instrumentName: 'my_histogram',
      aggregation: new ExplicitBucketHistogramAggregation(
        // Use the same default buckets as in `prom-client` for comparability
        // with "use-prom.js".
        [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10])
    })
  ]
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

// Histogram
// This histogram is measuring values in seconds, with the range expected to be
// mostly around 150ms (0.150). That means the default OTel Metrics buckets --
// `[0, 5, 10, 25, 50, 75, 100, 250, 500, 1000]` -- are useless. We use a View
// above to provide a more appropriate set.
const histo = meter.createHistogram('my_histogram', { description: 'My Histogram' })

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
  for (let i = 0; i < 100; i++) {
    // A Gaussian distribution centered on 150ms, with a minimum 1ms. This is
    // an attempt at a "known" distribution for a response latency metric for
    // a service getting 100 req/s.
    const valS = Math.max(gaussianRandom(0.150, 0.050), 0.001)
    histo.record(valS)
  }
}, 1000)
