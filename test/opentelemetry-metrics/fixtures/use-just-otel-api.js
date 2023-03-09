/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// When run with the APM agent, we expect a MeterProvider to be implicitly
// provided by the agent, such that metrics are sent to APM server.

const otel = require('@opentelemetry/api')

const meter = otel.metrics.getMeter('test-meter')

const counter = meter.createCounter('test_counter', { description: 'A test Counter' })

let n = 0
const asyncCounter = meter.createObservableCounter('test_async_counter', { description: 'A test Asynchronous Counter' })
asyncCounter.addCallback(observableResult => {
  observableResult.observe(n)
})

const asyncGauge = meter.createObservableGauge('test_async_gauge', { description: 'A test Asynchronous Gauge' })
asyncGauge.addCallback(observableResult => {
  // A sine wave with a 5 minute period, to have a recognizable pattern.
  observableResult.observe(Math.sin(Date.now() / 1000 / 60 / 5 * (2 * Math.PI)))
})

const upDownCounter = meter.createUpDownCounter('test_updowncounter', { description: 'A test UpDownCounter' })

let c = 0
const asyncUpDownCounter = meter.createObservableUpDownCounter('test_async_updowncounter', { description: 'A test Asynchronous UpDownCounter' })
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
}, 200)
