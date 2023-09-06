/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const otel = require('@opentelemetry/api');

const meter = otel.metrics.getMeter('test-meter');
const counterAttrs = meter.createCounter('test_counter_attrs');

setInterval(() => {
  // Testing attrs:
  // - This should result in *3* metricsets.
  // - The array-valued attribute should be dropped and there should be a
  //   *single* logged warning about it.
  counterAttrs.add(1, {
    'http.request.method': 'POST',
    'http.response.status_code': '200',
  });
  counterAttrs.add(1, {
    'http.request.method': 'GET',
    'http.response.status_code': '200',
  });
  counterAttrs.add(1, {
    'http.request.method': 'GET',
    'http.response.status_code': '400',
  });
  counterAttrs.add(1, {
    'http.request.method': 'GET',
    'http.response.status_code': '200',
    array_valued_attr: ['foo', 'bar'],
  });
}, 200);
