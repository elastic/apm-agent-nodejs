/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small script that lists the context of the current directory.
// This exercises run context handling with async/await.
//
// Expect:
//     transaction "ls"
//     `- span "cwd"
//     `- span "readdir"

var apm = require('../../../../').start({
  // elastic-apm-node
  captureExceptions: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'ls-await',
});

let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}
const fsp = require('fs').promises;

let t1;

async function getCwd() {
  var s2 = apm.startSpan('cwd');
  try {
    return process.cwd();
  } finally {
    assert(apm.currentTransaction === t1);
    assert(apm.currentSpan === s2);
    s2.end();
  }
}

async function main() {
  t1 = apm.startTransaction('ls');
  assert(apm.currentTransaction === t1);
  try {
    const cwd = await getCwd();

    let entries;
    var s3 = apm.startSpan('readdir');
    try {
      assert(apm.currentSpan === s3);
      entries = await fsp.readdir(cwd);
      assert(apm.currentSpan === s3);
    } finally {
      assert(apm.currentSpan === s3);
      s3.end();
    }
    assert(apm.currentSpan === null);

    console.log('entries:', entries);
  } finally {
    assert(apm.currentTransaction === t1);
    t1.end();
  }

  assert(apm.currentTransaction === null);
}

main();
