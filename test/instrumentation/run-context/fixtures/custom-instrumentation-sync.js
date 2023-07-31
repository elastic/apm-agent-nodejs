/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An example creating custom spans via `apm.startSpan()` all in the same
// event loop task -- i.e. any active async-hook has no impact.
//
// Expect:
//   transaction "t1"
//   transaction "t3"
//   `- span "s4"
//     `- span "s5"
//   transaction "t2"

const apm = require('../../../../').start({
  // elastic-apm-node
  captureExceptions: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-simple',
});

let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}

var t1 = apm.startTransaction('t1');
assert(apm.currentTransaction === t1);
var t2 = apm.startTransaction('t2');
assert(apm.currentTransaction === t2);
var t3 = apm.startTransaction('t3');
assert(apm.currentTransaction === t3);
var s4 = apm.startSpan('s4');
assert(apm.currentSpan === s4);
var s5 = apm.startSpan('s5');
assert(apm.currentSpan === s5);
s4.end(); // (out of order)
assert(apm.currentSpan === s5);
s5.end();
assert(apm.currentSpan === null);
assert(apm.currentTransaction === t3);
t1.end(); // (out of order)
assert(apm.currentTransaction === t3);
t3.end();
assert(apm.currentTransaction === null);
t2.end();
assert(apm.currentTransaction === null);
