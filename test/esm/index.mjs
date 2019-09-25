'use strict'

// Node.js 12+ requires a fully qualified filename
import agent from '../../index.js'

agent.start({
  captureExceptions: false,
  metricsInterval: '0'
})
