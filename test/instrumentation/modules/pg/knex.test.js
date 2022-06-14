/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

process.env.ELASTIC_APM_TEST = true

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  spanCompressionEnabled: false
})

var knexVersion = require('knex/package').version
var semver = require('semver')

// knex 0.18.0 min supported node is v8, knex 0.21.0 min supported node is v10
if ((semver.gte(knexVersion, '0.18.0') && semver.lt(process.version, '8.6.0')) ||
  (semver.gte(knexVersion, '0.21.0') && semver.lt(process.version, '10.22.0'))) {
  console.log(`# SKIP knex@${knexVersion} does not support node ${process.version}`)
  process.exit()
}

var Knex = require('knex')
var test = require('tape')

var utils = require('./_utils')
var mockClient = require('../../../_mock_http_client')

var transNo = 0
var knex

var selectTests = [
  'knex.select().from(\'test\')',
  'knex.select(\'c1\', \'c2\').from(\'test\')',
  'knex.column(\'c1\', \'c2\').select().from(\'test\')',
  'knex(\'test\').select()'
]

if (semver.gte(knexVersion, '0.11.0')) {
  selectTests.push('knex.select().from(\'test\').timeout(10000)')
}

var insertTests = [
  'knex(\'test\').insert({c1: \'test1\', c2: \'test2\'})'
]

selectTests.forEach(function (source) {
  test(source, function (t) {
    resetAgent(function (data) {
      assertBasicQuery(t, data)
      t.end()
    })
    createClient(t, function userLandCode () {
      agent.startTransaction('foo' + ++transNo)

      var query = eval(source) // eslint-disable-line no-eval

      query.then(function (rows) {
        t.strictEqual(rows.length, 5)
        rows.forEach(function (row, i) {
          t.strictEqual(row.c1, 'foo' + (i + 1))
          t.strictEqual(row.c2, 'bar' + (i + 1))
        })
        agent.endTransaction()
      }).catch(function (err) {
        t.error(err)
      })
    })
  })
})

insertTests.forEach(function (source) {
  test(source, function (t) {
    resetAgent(function (data) {
      assertBasicQuery(t, data)
      t.end()
    })
    createClient(t, function userLandCode () {
      agent.startTransaction('foo' + ++transNo)

      var query = eval(source) // eslint-disable-line no-eval

      query.then(function (result) {
        t.strictEqual(result.command, 'INSERT')
        t.strictEqual(result.rowCount, 1)
        agent.endTransaction()
      }).catch(function (err) {
        t.error(err)
      })
    })
  })
})

test('knex.raw', function (t) {
  resetAgent(function (data) {
    assertBasicQuery(t, data)
    t.end()
  })
  createClient(t, function userLandCode () {
    agent.startTransaction('foo' + ++transNo)

    var query = knex.raw('SELECT * FROM "test"')

    query.then(function (result) {
      var rows = result.rows
      t.strictEqual(rows.length, 5)
      rows.forEach(function (row, i) {
        t.strictEqual(row.c1, 'foo' + (i + 1))
        t.strictEqual(row.c2, 'bar' + (i + 1))
      })
      agent.endTransaction()
    }).catch(function (err) {
      t.error(err)
    })
  })
})

function assertBasicQuery (t, data) {
  t.strictEqual(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.strictEqual(trans.name, 'foo' + transNo)

  // remove the 'select versions();' query that knex injects - just makes
  // testing too hard
  data.spans = data.spans.filter(function (span) {
    return span.context.db.statement !== 'select version();'
  })

  t.strictEqual(data.spans.length, 1)
  t.strictEqual(data.spans[0].type, 'db')
  t.strictEqual(data.spans[0].subtype, 'postgresql')
  t.strictEqual(data.spans[0].action, 'query')
  t.ok(data.spans[0].stacktrace.some(function (frame) {
    return frame.function === 'userLandCode'
  }), 'include user-land code frame')
}

function createClient (t, cb) {
  setup(function () {
    knex = Knex({
      client: 'pg',
      connection: {
        database: 'test_elastic_apm',
        user: process.env.PGUSER || 'postgres'
      }
    })
    t.on('end', () => {
      knex.destroy(function (err) {
        if (err) throw err
      })
      knex = undefined
    })
    cb()
  })
}

function setup (cb) {
  utils.reset(function () {
    utils.loadData(cb)
  })
}

function resetAgent (cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._transport.destroy) agent._transport.destroy()
  agent._transport = mockClient(cb)
  agent._instrumentation.testReset()
}
