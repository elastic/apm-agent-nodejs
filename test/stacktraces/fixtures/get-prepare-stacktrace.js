/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// print name of error.prepareStackTrace function to STDOUT
require('../../../').start({
  serviceName: 'test-get-prepare-stacktrace',
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
});
function main() {
  const name = Error.prepareStackTrace
    ? Error.prepareStackTrace.name
    : undefined;
  console.log(name);
}

main();
