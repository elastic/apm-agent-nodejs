/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

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
