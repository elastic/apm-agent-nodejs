'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0
})

var isHapiIncompat = require('../../../_is_hapi_incompat')
if (isHapiIncompat('@hapi/hapi')) {
  // Skip out of this test.
  process.exit()
}

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
