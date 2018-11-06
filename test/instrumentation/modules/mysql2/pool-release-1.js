'use strict'

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')
var pkgVersion = require('mysql2/package').version
if (semver.lt(process.version, '6.0.0') && semver.gte(pkgVersion, '1.6.0')) process.exit()

var mysql = require('mysql2')
var test = require('tape')

var utils = require('./_utils')

test('release connection prior to transaction', function (t) {
  createPool(function (pool) {
    pool.getConnection(function (err, conn) {
      t.error(err)
      conn.release() // important to release connection before starting the transaction

      agent.startTransaction('foo')
      t.ok(agent._instrumentation.currentTransaction)

      pool.getConnection(function (err, conn) {
        t.error(err)
        t.ok(agent._instrumentation.currentTransaction)
        pool.end()
        t.end()
      })
    })
  })
})

function createPool (cb) {
  setup(function () {
    cb(mysql.createPool(utils.credentials()))
  })
}

function setup (cb) {
  utils.reset(cb)
}
