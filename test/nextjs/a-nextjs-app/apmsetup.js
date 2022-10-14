/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const apm = require('../../../').start({ // elastic-apm-node
  // trentm-play7, 8.4.1
  serverUrl: 'https://my-deployment-31a70c.apm.us-west2.gcp.elastic-cloud.com',
  secretToken: '45g9zaO5n6dp2b5EPN',

  // XXX most of these for dev/debugging
  // apmServerVersion: '8.4.1',
  // stackTraceLimit: 10,
  cloudProvider: 'none',
  centralConfig: false,
  // metricsInterval: '0s',
  useElasticTraceparentHeader: false, // XXX
  // captureExceptions: false, // XXX
  logUncaughtExceptions: true,
  // usePathAsTransactionName: true,
  apiRequestTime: '3s'
  // logLevel: 'debug'
})

// Flush APM data on server process termination.
// https://nextjs.org/docs/deployment#manual-graceful-shutdowns
//
// XXX what version was `NEXT_MANUAL_SIG_HANDLE` added in?
// https://github.com/vercel/next.js/discussions/19693
process.env.NEXT_MANUAL_SIG_HANDLE = 1
function flushApmAndExit () {
  apm.flush(() => {
    process.exit(0)
  })
}
process.on('SIGTERM', flushApmAndExit)
process.on('SIGINT', flushApmAndExit)
