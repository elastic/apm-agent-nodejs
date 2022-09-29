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
  apiRequestTime: '5s',
  // logLevel: 'debug'
})

