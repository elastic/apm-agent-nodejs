/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
} else if (process.env.TEST_WITHOUT_SERVICES === 'true') {
  console.log('# SKIP: env.TEST_WITHOUT_SERVICES=true');
  process.exit(0);
}

require('../../../..').start({
  serviceName: 'test-knex-no-span-stack-traces',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  // Disable span stack traces, to test that knex instrumentation is then disabled.
  spanStackTraceMinDuration: -1,
});

var knexVersion = require('knex/package').version;
var semver = require('semver');

// knex 0.18.0 min supported node is v8, knex 0.21.0 min supported node is v10
if (
  (semver.gte(knexVersion, '0.18.0') && semver.lt(process.version, '8.6.0')) ||
  (semver.gte(knexVersion, '0.21.0') && semver.lt(process.version, '10.22.0'))
) {
  console.log(
    `# SKIP knex@${knexVersion} does not support node ${process.version}`,
  );
  process.exit();
}

var Knex = require('knex');
var test = require('tape');

test('knex instrumentation is disabled if not collecting span stacktraces', (t) => {
  // To test that knex instrumentation did *not* happen, we are assuming that
  // knex instrumentation wraps `Knex.Client.prototype.runner` and changes the
  // method name (to `wrappedRunner`).
  const runnerMethod = Knex.Client.prototype.runner;
  t.equal(
    runnerMethod.name,
    'runner',
    'Knex.Client.prototype.runner method name has not been changed',
  );
  t.end();
});
