// An agent-using script that throws. Used to test uncaughtException handling
// as configured by:
// - captureExceptions (default true)
// - logUncaughtExceptions (default false)

require('../..').start({
  serviceName: 'use-agent-and-throw',
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  logLevel: 'off'
})

console.log('started')
throw new Error('boom')
