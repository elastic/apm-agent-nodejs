'use strict'

module.exports = require('./').start({
  opentelemetryBridge: true,
  // XXX for now during dev of the OTel Bridge, quite down the agent
  centralConfig: false,
  cloudProvider: 'none',
  metricsInterval: '0s',
  captureExceptions: false,
  logUncaughtExceptions: true
})
