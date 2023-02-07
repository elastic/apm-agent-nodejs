/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses a Prometheus client to export metrics for scraping.
//    http://localhost:3003/metrics
// No OTel or Elastic APM usage user. This is a baseline for comparison.

'use strict'

const PORT = 3003
const SERVICE_NAME = 'otelmetrics-prom-prom'

const prom = require('prom-client') // https://github.com/siimon/prom-client
const Fastify = require('fastify')

// ---- mainline

// XXX what labels?
prom.register.setDefaultLabels({
  serviceName: SERVICE_NAME
})
// prom.collectDefaultMetrics(); // XXX

const counter = new prom.Counter({
  name: 'test_counter',
  help: 'A test Counter'
})

setInterval(() => {
  counter.inc(1)
}, 1000)

const fastify = Fastify({
  // logger: true // XXX
})
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})
fastify.get('/metrics', async function (request, reply) {
  reply.send(await prom.register.metrics())
  console.log('Scraped')
})
fastify.listen({ port: PORT }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  console.log(`Listening at ${address}`)
})

process.on('SIGTERM', () => {
  console.log('Bye (SIGTERM).')
  process.exit()
})
