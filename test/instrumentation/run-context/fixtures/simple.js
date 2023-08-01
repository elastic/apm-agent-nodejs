/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Expect:
//   transaction "t1"
//   `- span "s2"
//   transaction "t4"
//   `- span "s5"

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

setImmediate(function () {
  const t1 = apm.startTransaction('t1');
  assert(apm.currentTransaction === t1);

  setImmediate(function () {
    const s2 = apm.startSpan('s2');
    assert(apm.currentSpan === s2);

    setImmediate(function () {
      assert(apm.currentSpan === s2);
      s2.end();
      assert(apm.currentSpan === null);
      t1.end();
      assert(apm.currentTransaction === null);
      const s3 = apm.startSpan('s3');
      assert(s3 === null, 's3 is null because there is no current transaction');
    });

    assert(apm.currentSpan === s2);
  });

  const t4 = apm.startTransaction('t4');
  assert(apm.currentTransaction === t4);
  setImmediate(function () {
    const s5 = apm.startSpan('s5');
    assert(apm.currentSpan === s5);
    s5.end();
    t4.end();
    assert(apm.currentTransaction === null);
  });
});
