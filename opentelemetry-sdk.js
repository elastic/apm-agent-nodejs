'use strict'

// Start the Elastic APM agent as an OpenTelemetry SDK.
//
// The agent will register as a provider for OpenTelemetry tracing. User code
// can then use the OpenTelemetry Tracing API for manual tracing. As well,
// all of the Elastic APM agent's automatic instrumentations will be active.
//
// Usage:
//    node -r elastic-apm-node/opentelemetry-sdk MY-SCRIPT.js

module.exports = require('./').start({
  opentelemetrySdk: true,

  // XXX During dev of the OTel Bridge, turn off some agent bells & whistles.
  centralConfig: false,
  cloudProvider: 'none',
  metricsInterval: '0s',
  captureExceptions: false,
  logUncaughtExceptions: true
})
