/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// For the normal use case an "initapm.js" would look like:
//    module.exports = require('elastic-apm-node').start(/* { ... } */)

console.log('initapm: XXX start');
module.exports = require('../../../../../').start({
  // XXX remove all this config before merging
  // XXX
  logLevel: 'trace',
  apiRequestTime: '5s',
  // XXX traceContext Qs
  traceContinuationStrategy: 'restart_external',
  // XXX not fancy yet
  cloudProvider: 'none',
  centralConfig: false,
  metricsInterval: '0s',
});
console.log('initapm: XXX done');
