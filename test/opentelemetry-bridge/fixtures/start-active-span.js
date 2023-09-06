/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Expect:
//   transaction "s1" (outcome=unknown)
//   `- span "s2" (outcome=unknown)

'use strict';
const assert = require('assert');
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('test-start-span');

tracer.startActiveSpan('s1', (s1) => {
  assert.deepStrictEqual(
    otel.trace.getSpan(otel.context.active()).spanContext(),
    s1.spanContext(),
    's1 is active',
  );

  tracer.startActiveSpan('s2', (s2) => {
    assert.deepStrictEqual(
      otel.trace.getSpan(otel.context.active()).spanContext(),
      s2.spanContext(),
      's2 is active',
    );
    s2.end();
  });
  s1.end();
});
