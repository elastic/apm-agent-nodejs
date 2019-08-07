'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0
})

const pkg = require('@hapi/hapi/package')
const semver = require('semver')

// hapi 17+ requires Node.js 8.9.0 or higher
if (semver.lt(process.version, '8.9.0') && semver.gte(pkg.version, '17.0.0')) process.exit()
// hapi 16.7.0+ requires Node.js 6.0.0 or higher
if (semver.lt(process.version, '6.0.0') && semver.gte(pkg.version, '16.7.0')) process.exit()

let asserts = 0

agent.setFramework = function ({ name, version, overwrite }) {
  asserts++
  assert.strictEqual(name, 'hapi')
  assert.strictEqual(version, require('@hapi/hapi/package').version)
  assert.strictEqual(overwrite, false)
}

const assert = require('assert')

require('@hapi/hapi')

assert.strictEqual(asserts, 1)
