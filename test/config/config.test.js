/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test the normalizer functions
const test = require('tape')
const { MockLogger } = require('../_mock_logger')

const { printLoggingPreamble } = require('../../lib/config/config')

test('#printLoggingPreamble()', function (t) {
  const logger = new MockLogger()
  const config = { logger }
  const sources = {
    environment: {
      apiRequestSize: '1024kb'
    },
    start: {
      apiRequestSize: '512kb',
      apiRequestTime: '10s',
      apiKey: ' a-secret-key',
      secretToken: 'secret-token',
      serverUrl: 'https://server-url'
    },
    file: {
      apiRequestSize: '256kb',
      apiRequestTime: '5s',
      captureExceptions: false,
      logger: function () {},
      transport: function () {}
    }
  }

  printLoggingPreamble(config, sources, null)

  const { calls } = logger
  console.log(calls)
  t.ok(logExists(calls, '- apiRequestSize: 1024kb (environment)'), 'environment options get printed')
  t.ok(logExists(calls, '- apiRequestTime: 10s (start)'), 'start options get printed')
  t.ok(logExists(calls, '- captureExceptions: false (file)'), 'file options get printed')
  t.ok(logExists(calls, '- apiKey: [REDACTED] (start)'), 'sensitive option "apiKey" gets [REDACTED]')
  t.ok(logExists(calls, '- secretToken: [REDACTED] (start)'), 'sensitive option "secretToken" gets [REDACTED]')
  t.ok(logExists(calls, '- serverUrl: [REDACTED] (start)'), 'sensitive option "serverUrl" gets [REDACTED]')
  t.ok(logExists(calls, '- logger:') === false, 'logger should not be printed')
  t.ok(logExists(calls, '- transport:') === false, 'transport should not be printed')
  t.end()
})

function logExists (calls, text) {
  return calls.some(c => c.message.indexOf(text) !== -1)
}
