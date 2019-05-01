'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0
})

const pkg = require('restify/package.json')
const semver = require('semver')

if (semver.lt(process.version, '8.6.0') && semver.gte(pkg.version, '8.0.0')) process.exit()

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
