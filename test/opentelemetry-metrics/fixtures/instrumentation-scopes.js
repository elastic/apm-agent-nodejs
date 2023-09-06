/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const otel = require('@opentelemetry/api');

const meterA = otel.metrics.getMeter('test-meter');
const counterA = meterA.createCounter('test_counter_a');
const meterB = otel.metrics.getMeter('test-meter', '1.2.3');
const counterB = meterB.createCounter('test_counter_b');
const meterC = otel.metrics.getMeter('test-meter', '1.2.4');
const counterC = meterC.createCounter('test_counter_c');
const meterD = otel.metrics.getMeter('test-meter2', '1.2.3');
const counterD = meterD.createCounter('test_counter_d');
const meterE = otel.metrics.getMeter('test-meter2', '1.2.3');
const counterE = meterE.createCounter('test_counter_e');

setInterval(() => {
  // This should result in these counters being sent in *four* separate
  // metricsets, because they have different instrumentation scopes.
  // `test_counter_d` and `test_counter_e` should be in the same metricset.
  counterA.add(1);
  counterB.add(1);
  counterC.add(1);
  counterD.add(1);
  counterE.add(1);
}, 200);
