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

const counter = meter.createCounter('test_counter', { description: 'A test counter' })

let n = 0
const obsCounter = meter.createObservableCounter('test_obs_counter', { description: 'A test observable counter' })
obsCounter.addCallback(observableResult => {
  observableResult.observe(n)
})

setInterval(() => {
  n++
  counter.add(1)
}, 200)
