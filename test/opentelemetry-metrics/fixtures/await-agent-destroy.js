/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// The goal of this test is to ensure that `await apm.destroy()` doesn't
// log.warn. When OTel Metrics are involved, the Agent#destroy() method
// will shutdown the MeterProvider, which calls Agent#flush(). This test
// check that code path works.

const apm = require('../../../');
const otel = require('@opentelemetry/api');

const meter = otel.metrics.getMeter('test-meter');
const counter = meter.createCounter('test_counter');

setInterval(() => {
  counter.add(1);
}, 250);

setTimeout(async () => {
  await apm.destroy();
}, 1000);
