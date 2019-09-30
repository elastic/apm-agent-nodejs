'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})

let asserts = 0

agent.setFramework = function ({ name, version, overwrite }) {
  asserts++
  assert.strictEqual(name, 'restify')
  assert.strictEqual(version, require('restify/package').version)
  assert.strictEqual(overwrite, false)
}

const assert = require('assert')

require('restify')

assert.strictEqual(asserts, 1)
