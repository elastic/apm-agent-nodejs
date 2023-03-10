/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const otel = require('@opentelemetry/api')

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
// `[0, 5, 10, 25, 50, 75, 100, 250, 500, 1000]` -- are useless. We rely on the
// better default bucket sizes in the APM agent to handle this.
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
