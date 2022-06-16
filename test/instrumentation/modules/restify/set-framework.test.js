/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Restify is broken on latest node v18 nightlies.
// https://github.com/restify/node-restify/issues/1888
const semver = require('semver')
if (semver.satisfies(process.version, '>17.x', { includePrerelease: true })) {
  console.log(`# SKIP restify does not support node ${process.version}`)
  process.exit()
}

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
