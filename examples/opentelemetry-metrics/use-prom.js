/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses a Prometheus client to export metrics for scraping.
//    http://localhost:3003/metrics
// No OTel or Elastic APM usage here. This is a baseline for comparison.

'use strict'

const PORT = 3001
const SERVICE_NAME = 'use-prom'

const prom = require('prom-client') // https://github.com/siimon/prom-client
const Fastify = require('fastify')

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

// Setup metrics.
prom.register.setDefaultLabels({
  serviceName: SERVICE_NAME
})

const counter = new prom.Counter({
  name: 'my_counter',
  help: 'My Counter'
})

// Asynchronous Counter
// prom-client's Counter just has a `.inc()` method, so there isn't a
// reasonable equivalent to OTel's Asynchronous Counter.

// Asynchronous Gauge
// A sine wave with a 5 minute period, to have a recognizable pattern.
new prom.Gauge({ // eslint-disable-line no-new
  name: 'my_async_gauge',
  help: 'My Asynchronous Gauge',
  collect () {
    this.set(Math.sin(Date.now() / 1000 / 60 / 5 * (2 * Math.PI)))
  }
})

// UpDownCouner
// Count up once per second in the first half of the minute, down otherwise.
const upDownCounter = new prom.Gauge({
  name: 'my_updowncounter',
  help: 'My UpDownCounter'
})

// Histogram
const histo = new prom.Histogram({
  name: 'my_histogram',
  help: 'My Histogram'
})

setInterval(() => {
  counter.inc(1)
  if (new Date().getUTCSeconds() < 30) {
    upDownCounter.inc()
  } else {
    upDownCounter.dec()
  }
  for (let i = 0; i < 100; i++) {
    // A Gaussian distribution centered on 150ms, with a minimum 1ms. This is
    // an attempt at a "known" distribution for a response latency metric for
    // a service getting 100 req/s.
    const valS = Math.max(gaussianRandom(0.150, 0.050), 0.001)
    histo.observe(valS)
  }
}, 1000)

// Create a simple HTTP server with 'GET /metrics' to export Prometheus metrics.
const fastify = Fastify({})
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})
fastify.get('/metrics', async function (request, reply) {
  reply.send(await prom.register.metrics())
})
fastify.listen({ port: PORT }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  console.log(`Listening at ${address}`)
  console.log(`Prometheus metrics at ${address}/metrics`)
})
