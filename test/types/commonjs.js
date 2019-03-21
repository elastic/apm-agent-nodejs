'use strict'

const agent = require('../../')

agent.start({
  captureExceptions: false,
  metricsInterval: '0'
})
