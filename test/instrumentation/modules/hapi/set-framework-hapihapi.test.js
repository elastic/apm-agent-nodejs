/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
});

var isHapiIncompat = require('../../../_is_hapi_incompat');
if (isHapiIncompat('@hapi/hapi')) {
  // Skip out of this test.
  console.log(
    `# SKIP this version of '@hapi/hapi' is incompatible with node ${process.version}`,
  );
  process.exit();
}
const tape = require('tape');

tape('@hapi/hapi set-framework test', function (t) {
  let asserts = 0;

  agent.setFramework = function ({ name, version, overwrite }) {
    asserts++;
    t.equals(name, 'hapi');
    t.equals(version, require('@hapi/hapi/package').version);
    t.equals(overwrite, false);
  };

  require('@hapi/hapi');

  t.equals(asserts, 1);
  t.end();
});
