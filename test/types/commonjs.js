/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test that types work for CommonJS code.
// `tsc` will error out of there is a type conflict.

'use strict';

const agent = require('../../');

agent.start({
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false,
});
