/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Supported Node.js version range for import-in-the-middle usage.
// - v12.20.0 add "named exports for CJS via static analysis"
//   https://nodejs.org/en/blog/release/v12.20.0
// - v14.13.1 includes "named exports for CJS via static analysis" plus some
//   fixes in the .1 minor release
// - v18.1.0 fixes an issue in v18.0.0
//   https://github.com/nodejs/node/pull/42881
// - Current node v20 does not work with IITM
//   https://github.com/DataDog/import-in-the-middle/pull/27
const NODE_VER_RANGE_IITM = '^12.20.0 || ^14.13.1 || ^16.0.0 || ^18.1.0 <20';

module.exports = {
  NODE_VER_RANGE_IITM,
};
