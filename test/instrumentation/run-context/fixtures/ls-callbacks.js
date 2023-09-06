/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small script that lists the context of the current directory.
// This exercises run context handling with callbacks.
//
// Expect:
//     transaction "ls"
//     `- span "cwd"
//     `- span "readdir"

const apm = require('../../../../').start({
  // elastic-apm-node
  captureExceptions: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'ls-callbacks',
});

let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}
const fs = require('fs');

let t1;

function getCwd() {
  const s2 = apm.startSpan('cwd');
  try {
    return process.cwd();
  } finally {
    assert(apm.currentTransaction === t1);
    assert(apm.currentSpan === s2);
    s2.end();
  }
}

function main() {
  t1 = apm.startTransaction('ls');
  assert(apm.currentTransaction === t1);

  const cwd = getCwd();
  const s3 = apm.startSpan('readdir');
  assert(apm.currentSpan === s3);
  fs.readdir(cwd, function (_err, entries) {
    assert(apm.currentSpan === s3);
    s3.end();
    assert(apm.currentSpan === null);

    console.log('entries:', entries);

    assert(apm.currentTransaction === t1);
    t1.end();
    assert(apm.currentTransaction === null);
  });
}

main();
