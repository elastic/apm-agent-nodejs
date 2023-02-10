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

// ---- mainline

// Setup metrics.
prom.register.setDefaultLabels({
  serviceName: SERVICE_NAME
})
const counter = new prom.Counter({
  name: 'test_counter',
  help: 'A test Counter'
})
setInterval(() => {
  counter.inc(1)
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
