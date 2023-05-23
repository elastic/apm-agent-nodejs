/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const test = require('tape')

const { CONFIG_DEFINITIONS } = require('./fixtures/config-schema')

const Agent = require('../../lib/agent')
const { NoopTransport } = require('../../lib/noop-transport')
const MockLogger = require('./_mock_logger')

// Options to pass to `agent.start()` to turn off some default agent behavior
// that is unhelpful for these tests.
const agentOpts = {
  centralConfig: false,
  captureExceptions: false,
  metricsInterval: '0s',
  cloudProvider: 'none',
  logLevel: 'warn'
}
const agentOptsNoTransportNoLogger = Object.assign(
  {},
  agentOpts,
  {
    logger: new MockLogger(),
    transport: function createNoopTransport () {
      // Avoid accidentally trying to send data to an APM server.
      return new NoopTransport()
    }
  }
)

function hasType (def, type) {
  return def.types && def.types.indexOf(type) !== -1
}

function testEnvVar (t, option, value1, value2) {
  const existingEnvValue = process.env[option.envVar]
  const agent = new Agent()
  const opts = {}
  let value = value1

  if (value2) {
    opts[option.name] = value1
    value = value2
  }

  process.env[option.envVar] = value.toString()
  agent.start(agentOptsNoTransportNoLogger)
  t.strictEqual(agent._conf[option.name], value)

  process.env[option.envVar] = existingEnvValue
  agent.destroy()
  t.end()
}

// Test BOOLS
const BOOL_OPTS_WITH_ENV_EXCLUDED = [
  // This ones depend on other options so we should have specific tests
  'captureSpanStackTraces',
  'asyncHooks',
  // this one seems to have a bug
  'breakdownMetrics'
]
const BOOL_OPTS_WITH_ENV = CONFIG_DEFINITIONS.filter(function (def) {
  const isExcluded = BOOL_OPTS_WITH_ENV_EXCLUDED.indexOf(def.name) !== -1
  return ('envVar' in def) && !isExcluded && hasType(def, 'boolean')
})

// Test BOOLEAN configurations
BOOL_OPTS_WITH_ENV.forEach(function (option) {
  test(`${option.name} should be configurable by environment variable ${option.envVar}`, function (t) {
    testEnvVar(t, option, !option.defaultValue)
  })

  test(`should overwrite option property ${option.name} by environment variable ${option.envVar}`, function (t) {
    testEnvVar(t, option, !option.defaultValue, !!option.defaultValue)
  })
})

// Test BOOLS
const NUM_OPTS_WITH_ENV_EXCLUDED = [
]
const NUM_OPTS_WITH_ENV = CONFIG_DEFINITIONS.filter(function (def) {
  const isExcluded = NUM_OPTS_WITH_ENV_EXCLUDED.indexOf(def.name) !== -1
  return ('envVar' in def) && !isExcluded && hasType(def, 'number')
})

NUM_OPTS_WITH_ENV.forEach(function (option) {
  test(`${option.name} should be configurable by environment variable ${option.envVar}`, function (t) {
    testEnvVar(t, option, 1)
  })

  test(`should overwrite option property ${option.name} by environment variable ${option.envVar}`, function (t) {
    testEnvVar(t, option, 1, 2)
  })
})
