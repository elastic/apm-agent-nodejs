/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const otel = require('@opentelemetry/api')

const meter = otel.metrics.getMeter('my-meter')

const counter = meter.createCounter('my_counter', { description: 'My counter' })

let n = 0
const obsCounter = meter.createObservableCounter('my_obs_counter', { description: 'My observable counter' })
obsCounter.addCallback(observableResult => {
  observableResult.observe(n)
})

setInterval(() => {
  n++
  counter.add(1)
}, 1000)
