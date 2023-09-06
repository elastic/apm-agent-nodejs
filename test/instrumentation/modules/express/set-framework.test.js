/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
});
const tape = require('tape');

tape('express set-framework test', function (t) {
  let asserts = 0;

  agent.setFramework = function ({ name, version, overwrite }) {
    asserts++;
    t.equals(name, 'express');
    t.equals(version, require('express/package').version);
    t.equals(overwrite, false);
  };

  require('express');

  t.equals(asserts, 1);
  t.end();
});
