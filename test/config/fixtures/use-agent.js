/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { NoopApmClient } = require('../../../lib/apm-client/noop-apm-client');

const APM_START_OPTIONS = {
  transport: () => new NoopApmClient(),
};

// Test may want to pass extra start options
if (process.env.TEST_APM_START_OPTIONS) {
  Object.assign(
    APM_START_OPTIONS,
    JSON.parse(process.env.TEST_APM_START_OPTIONS),
  );
}
// this prefix will be used to get info from the test suite
const logPrefix = 'use-agent log:';
const apm = require('../../..').start(APM_START_OPTIONS);

// Collect elastic ENV vas to pass it back to the test suite
const APM_ENV_OPTIONS = Object.keys(process.env).reduce((acc, key) => {
  if (key.startsWith('ELASTIC_APM')) {
    acc[key] = process.env[key];
  }
  return acc;
}, {});

// Report options passed by env
console.log(`${logPrefix}${JSON.stringify(APM_ENV_OPTIONS)}`);

// Report options used to start
console.log(`${logPrefix}${JSON.stringify(APM_START_OPTIONS)}`);

// Just spit out the resolved configuration
console.log(`${logPrefix}${JSON.stringify(apm._conf)}`);
