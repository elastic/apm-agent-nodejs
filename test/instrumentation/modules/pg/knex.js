'use strict'

process.env.ELASTIC_APM_TEST = true

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var knexVersion = require('knex/package').version
var pgVersion = require('pg/package').version
var semver = require('semver')

// pg@7+ doesn't support Node.js pre 4.5.0
if (semver.lt(process.version, '4.5.0') && semver.gte(pgVersion, '7.0.0')) process.exit()
// knex@0.15+ doesn't support Node.js pre 6.0.0
if (semver.lt(process.version, '6.0.0') && semver.gte(knexVersion, '0.15.0')) process.exit()

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
    createClient(function userLandCode () {
      agent.startTransaction('foo' + ++transNo)

      var query = eval(source) // eslint-disable-line no-eval

      query.then(function (rows) {
        t.equal(rows.length, 5)
        rows.forEach(function (row, i) {
          t.equal(row.c1, 'foo' + (i + 1))
          t.equal(row.c2, 'bar' + (i + 1))
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
    createClient(function userLandCode () {
      agent.startTransaction('foo' + ++transNo)

      var query = eval(source) // eslint-disable-line no-eval

      query.then(function (result) {
        t.equal(result.command, 'INSERT')
        t.equal(result.rowCount, 1)
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
  createClient(function userLandCode () {
    agent.startTransaction('foo' + ++transNo)

    var query = knex.raw('SELECT * FROM "test"')

    query.then(function (result) {
      var rows = result.rows
      t.equal(rows.length, 5)
      rows.forEach(function (row, i) {
        t.equal(row.c1, 'foo' + (i + 1))
        t.equal(row.c2, 'bar' + (i + 1))
      })
      agent.endTransaction()
    }).catch(function (err) {
      t.error(err)
    })
  })
})

function assertBasicQuery (t, data) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, 'foo' + transNo)

  // remove the 'select versions();' query that knex injects - just makes
  // testing too hard
  data.spans = data.spans.filter(function (span) {
    return span.context.db.statement !== 'select version();'
  })

  t.equal(data.spans.length, 1)
  t.equal(data.spans[0].type, 'db.postgresql.query')
  t.ok(data.spans[0].stacktrace.some(function (frame) {
    return frame.function === 'userLandCode'
  }), 'include user-land code frame')
}

function createClient (cb) {
  setup(function () {
    knex = Knex({
      client: 'pg',
      connection: 'postgres:///test_elastic_apm'
    })
    cb()
  })
}

function setup (cb) {
  // just in case it didn't happen at the end of the previous test
  teardown(function () {
    utils.reset(function () {
      utils.loadData(cb)
    })
  })
}

function teardown (cb) {
  if (knex) {
    knex.destroy(function (err) {
      if (err) throw err
      knex = undefined
      if (cb) cb()
    })
  } else if (cb) {
    process.nextTick(cb)
  }
}

function resetAgent (cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._apmServer.destroy) agent._apmServer.destroy()
  agent._apmServer = mockClient(function (data) {
    // ensure we never leave the db open after the test, otherwise the last
    // test will leave the process hanging in some combinations of pg/knex for
    // some reason
    teardown(function () {
      cb(data)
    })
  })
  agent._instrumentation.currentTransaction = null
}
