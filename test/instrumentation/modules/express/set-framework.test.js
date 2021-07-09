'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})
const tape = require('tape')

tape('express set-framework test', function (t) {
  let asserts = 0

  agent.setFramework = function ({ name, version, overwrite }) {
    asserts++
    t.equals(name, 'express')
    t.equals(version, require('express/package').version)
    t.equals(overwrite, false)
  }

  require('express')

  t.equals(asserts, 1)
  t.end()
})
