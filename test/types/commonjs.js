// Test that types work for CommonJS code.
// `tsc` will error out of there is a type conflict.

'use strict'

const agent = require('../../')

agent.start({
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false
})
