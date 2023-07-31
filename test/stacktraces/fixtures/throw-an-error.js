/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Throw an error. We expect the APM agent to capture the exception and
// send an error to the APM server.

require('../../../').start({
  serviceName: 'test-throw-an-error',
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
  // This tells the agent to catch unhandled exceptions:
  captureExceptions: true,
});

function main() {
  throw new Error('boom');
}

main();
