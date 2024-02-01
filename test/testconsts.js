/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const os = require('os');

// Supported Node.js version range for import-in-the-middle usage.
// - v12.20.0 add "named exports for CJS via static analysis"
//   https://nodejs.org/en/blog/release/v12.20.0
// - v14.13.1 includes "named exports for CJS via static analysis" plus some
//   fixes in the .1 minor release
// - v18.1.0 fixes an issue in v18.0.0
//   https://github.com/nodejs/node/pull/42881
// - `^18.19.0 || >=20` support was added by IITM@1.7.3
//   https://github.com/DataDog/import-in-the-middle/pull/27
// - v20.2.0 fixes an issue in v20
//   I think it is https://github.com/nodejs/node/issues/47929
const NODE_VER_RANGE_IITM =
  '^12.20.0 || ^14.13.1 || ^16.0.0 || ^18.1.0 || >=20.2.0';
const NODE_VER_RANGE_IITM_GE14 = '^14.13.1 || ^16.0.0 || ^18.1.0 || >=20.2.0'; // NODE_VER_RANGE_IITM minus node v12

// This can be passed as tape test options for tests that are timing sensitive,
// to *skip* those tests on Windows CI.
const TIMING_SENSITIVE_TEST_OPTS = {
  skip:
    os.platform() === 'win32' && process.env.CI === 'true'
      ? '(skip timing-sensitive test on Windows CI)'
      : false,
};

module.exports = {
  NODE_VER_RANGE_IITM,
  NODE_VER_RANGE_IITM_GE14,
  TIMING_SENSITIVE_TEST_OPTS,
};
