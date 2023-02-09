/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// When run with the APM agent, we expect a MeterProvider to be implicitly
// provided by the agent, such that metrics are sent to APM server.

const otel = require('@opentelemetry/api')

const meter = otel.metrics.getMeter('my-meter')
const counter = meter.createCounter('test_counter', { description: 'A test Counter' })
setInterval(() => {
  counter.add(1)
}, 200)
