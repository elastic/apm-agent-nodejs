/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

console.log('XXX otelapi-counter: start')

// Expect periodic metricsets like this:
//     {
//       metricset: {
//         samples: { test_counter: { type: 'counter', value: 2 } },
//         timestamp: 1675810106904000,
//         tags: {}
//       }
//     }

const otel = require('@opentelemetry/api')
console.log('XXX otelapi-counter: after otel/api import')

const meter = otel.metrics.getMeter('my-meter')
console.log('XXX otelapi-counter: got a meter')
const counter = meter.createCounter('test_counter', { description: 'A test Counter' })
console.log('XXX otelapi-counter: got a counter')
setInterval(() => {
  counter.add(1)
}, 200)
