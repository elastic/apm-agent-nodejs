/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
});

let asserts = 0;

agent.setFramework = function ({ name, version, overwrite }) {
  asserts++;
  assert.strictEqual(name, 'koa');
  assert.strictEqual(version, require('koa/package').version);
  assert.strictEqual(overwrite, false);
};

const assert = require('assert');

require('koa');

assert.strictEqual(asserts, 1);
