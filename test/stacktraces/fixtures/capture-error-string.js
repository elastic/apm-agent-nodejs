// We expect `agent.captureError(<non-Error-object>)` to result in an APM error
// object with `error.log.stacktrace`.

const agent = require('../../../').start({
  serviceName: 'test-capture-error-string',
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
  // This tells the APM agent to include 'error.log.stacktrace':
  captureErrorLogStackTraces: 'messages'
})

function main () {
  agent.captureError('a string error message')
  agent.captureError({ message: 'message template: %d', params: [42] })
}

main()
