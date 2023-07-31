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

require('../../../..').start({
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

const isFastifyIncompat = require('../../../_is_fastify_incompat')();
if (isFastifyIncompat) {
  console.log(`# SKIP ${isFastifyIncompat}`);
  process.exit();
}

require('./_async-await');
