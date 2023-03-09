/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const otel = require('@opentelemetry/api')

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
