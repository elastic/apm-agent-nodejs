/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

require('elastic-apm-node').start({
  // XXX most of these for dev/debugging
  apmServerVersion: '8.4.1',
  cloudProvider: 'none',
  centralConfig: false,
  metricsInterval: '0s',
  useElasticTraceparentHeader: false, // XXX
  // captureExceptions: false, // XXX
  logUncaughtExceptions: true,
  // usePathAsTransactionName: true,
  apiRequestTime: '3s'
  // logLevel: 'debug'
})
