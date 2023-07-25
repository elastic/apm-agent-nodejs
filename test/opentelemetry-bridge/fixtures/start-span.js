/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Expect:
//   transaction "mySpan"

'use strict';
let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('test-start-span');

const s = tracer.startSpan('mySpan');

// OTel's startSpan does *not* make the span active/current.
assert.ok(
  otel.trace.getSpan(otel.context.active()) === undefined,
  'no active span',
);

s.end();
