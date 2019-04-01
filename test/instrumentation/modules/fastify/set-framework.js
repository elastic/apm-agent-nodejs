'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0
})

let asserts = 0

agent.setFramework = function ({ name, version, overwrite }) {
  asserts++
  assert.strictEqual(name, 'fastify')
  assert.strictEqual(version, require('fastify/package').version)
  assert.strictEqual(overwrite, false)
}

const assert = require('assert')

require('fastify')

assert.strictEqual(asserts, 1)
