const { CapturingTransport } = require('../_capturing_transport')

module.exports = {
  serviceName: 'test-babel',
  logUncaughtExceptions: true,

  // Setup a transport that captures sent data, so we can assert that expected
  // data was sent.
  transport: () => {
    return new CapturingTransport()
  }
}
