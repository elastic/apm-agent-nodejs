/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// This file will be run with test values of the `disableMetrics` config var.

const otel = require('@opentelemetry/api');

const meter1 = otel.metrics.getMeter('test-meter', '1');
const meter2 = otel.metrics.getMeter('test-meter', '2');
const counters = [
  meter1.createCounter('foo-counter-1'),
  meter1.createCounter('bar-counter-1'),
  meter2.createCounter('foo-counter-2'),
];

setInterval(() => {
  counters.forEach((c) => {
    c.add(1);
  });
}, 200);
