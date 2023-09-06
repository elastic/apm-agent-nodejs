/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Some testing of run-context tracking through 'fs' methods.

const apm = require('../..').start({
  serviceName: 'test-fs',
  captureExceptions: false,
  metricsInterval: '0s',
  centralConfig: false,
  cloudProvider: 'none',
  disableSend: true,
});

const fs = require('fs');

const tape = require('tape');

if (typeof fs.realpath.native === 'function') {
  // Before https://github.com/elastic/apm-agent-nodejs/issues/2401 this test
  // would crash with asyncHooks=false
  tape.test('fs.realpath.native', function (t) {
    var trans = apm.startTransaction('t0');
    var span = apm.startSpan('s1');
    fs.realpath.native(__filename, function (err, resolvedPath) {
      t.error(err, 'no error from fs.realpath.native');
      t.equal(apm.currentSpan, span, 'apm.currentSpan is as expected');
      span.end();
      trans.end();
      t.end();
    });
  });
}
