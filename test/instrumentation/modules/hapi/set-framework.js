'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})

let asserts = 0

agent.setFramework = function ({ name, version, overwrite }) {
  asserts++
  assert.strictEqual(name, 'hapi')
  assert.strictEqual(version, require('hapi/package').version)
  assert.strictEqual(overwrite, false)
}

const assert = require('assert')

require('hapi')

assert.strictEqual(asserts, 1)
