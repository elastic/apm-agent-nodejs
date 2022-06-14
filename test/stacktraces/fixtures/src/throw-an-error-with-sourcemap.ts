/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// TypeScript code that throws an error. We will compile to a JS file with
// a sourcemap to test that stacktrace handling uses the sourcemap properly.

import agent from '../../../../'
agent.start({
  serviceName: 'test-throw-an-error-with-sourcemap',
  logUncaughtExceptions: true,
  metricsInterval: '0',
  centralConfig: false,
  logLevel: 'off',
  // This tells the agent to catch unhandled exceptions:
  captureExceptions: true
})

function main(msg: string) {
  throw new Error(msg)
}

main('boom')
