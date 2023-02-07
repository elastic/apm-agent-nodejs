/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An app that uses the OTel Metrics *API* without the OTel SDK,
// elastic-apm-node turned on (metrics interval set to 5s) and providing a
// default global MetricsProvider sending to APM server.

'use strict'

process.env.ELASTIC_APM_SERVICE_NAME = 'otelmetrics-otelapi-elastic'
require('elastic-apm-node/start')

const otel = require('@opentelemetry/api')
// otel.diag.setLogger(new otel.DiagConsoleLogger(), otel.DiagLogLevel.ALL) // get some OTel debug logging

const meter = otel.metrics.getMeter('foobar') // XXX what's this string used for?
console.log('XXX meter: ', meter)
const counter = meter.createCounter('test_counter', {
  description: 'A test Counter'
})
// const attributes = { pid: process.pid, environment: 'staging' } // XXX
setInterval(() => {
  counter.add(1)
  // counter.add(1, attributes)
}, 1000)

process.on('SIGTERM', () => {
  console.log('Bye (SIGTERM).')
  process.exit()
})
