/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/* eslint-disable */

'use strict'

const apm = require('elastic-apm-node').start({
  // serverUrl: '...'
  // secretToken: '...',
  serviceName: 'use-otel-metrics-via-elastic-apm',
  metricsInterval: '3s'
})

const otel = require('@opentelemetry/api')
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging
























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
