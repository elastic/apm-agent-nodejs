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
const tape = require('tape')

tape('@hapi/hapi set-framework test', function (t) {
  let asserts = 0

  agent.setFramework = function ({ name, version, overwrite }) {
    asserts++
    t.equals(name, 'hapi')
    t.equals(version, require('@hapi/hapi/package').version)
    t.equals(overwrite, false)
  }

  require('@hapi/hapi')

  t.equals(asserts, 1)
  t.end()
})
