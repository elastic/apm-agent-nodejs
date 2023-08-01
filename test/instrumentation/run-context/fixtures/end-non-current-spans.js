/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// This test case shows that `span.end()` impacts the current run context's
// span stack, even if the ended span is not the current one. When s3 and s2
// are ended below, they are not the current span.
//
// Expected:
//   transaction "t0"
//   `- span "s1"
//     `- span "s2"
//     `- span "s3"
//       `- span "s4"

const apm = require('../../../../').start({
  // elastic-apm-node
  captureExceptions: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-end-non-current-spans',
});

let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}

const t0 = apm.startTransaction('t0');
const s1 = apm.startSpan('s1');
setImmediate(function () {
  const s3 = apm.startSpan('s3');
  setImmediate(function () {
    const s4 = apm.startSpan('s4');
    // Ending a span removes it from the current run context, even if it is
    // not top of stack, or not even part of this run context.
    s3.end(); // out of order
    s2.end(); // not in this run context
    s4.end();
    assert(apm.currentSpan === s1);
    s1.end();
    t0.end();
  });
});

const s2 = apm.startSpan('s2');
