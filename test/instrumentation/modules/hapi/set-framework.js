'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})

const pkg = require('hapi/package')
const semver = require('semver')

// hapi 17+ requires Node.js 8.9.0 or higher
if (semver.lt(process.version, '8.9.0') && semver.gte(pkg.version, '17.0.0')) process.exit()

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
