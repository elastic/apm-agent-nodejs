'use strict'

const agent = require('../../../..').start({
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})

const tape = require('tape')

tape('restify set-framework test', function (t) {
  let asserts = 0

  agent.setFramework = function ({ name, version, overwrite }) {
    asserts++
    t.equals(name, 'restify')
    t.equals(version, require('restify/package').version)
    t.equals(overwrite, false)
  }

  require('restify')

  t.equals(asserts, 1)
  t.end()
})
