'use strict'

process.env.OPBEAT_TEST = true

var agent = require('../../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')
var pgVersion = require('pg/package').version
var knexVersion = require('knex/package').version

// pg@7+ doesn't support Node.js pre 4.5.0
if (semver.lt(process.version, '4.5.0') && semver.gte(pgVersion, '7.0.0')) process.exit()

var test = require('tape')
var exec = require('child_process').exec
var Knex = require('knex')

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
    resetAgent(function (endpoint, headers, data, cb) {
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
        agent._instrumentation._queue._flush()
      }).catch(function (err) {
        t.error(err)
      })
    })
  })
})

insertTests.forEach(function (source) {
  test(source, function (t) {
    resetAgent(function (endpoint, headers, data, cb) {
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
        agent._instrumentation._queue._flush()
      }).catch(function (err) {
        t.error(err)
      })
    })
  })
})

test('knex.raw', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
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
      agent._instrumentation._queue._flush()
    }).catch(function (err) {
      t.error(err)
    })
  })
})

function assertBasicQuery (t, data) {
  // remove the 'select versions();' query that knex injects - just makes
  // testing too hard
  var selectVersion = false
  data.traces.groups = data.traces.groups.filter(function (group) {
    if (group.extra.sql === 'select version();') {
      selectVersion = true
      return false
    }
    return true
  })

  // data.traces.groups:
  t.equal(data.traces.groups.length, 2)

  t.equal(data.traces.groups[0].kind, 'db.postgresql.query')
  t.deepEqual(data.traces.groups[0].parents, ['transaction'])
  t.equal(data.traces.groups[0].transaction, 'foo' + transNo)
  t.ok(data.traces.groups[0].extra._frames.some(function (frame) {
    return frame.function === 'userLandCode'
  }), 'include user-land code frame')

  t.equal(data.traces.groups[1].kind, 'transaction')
  t.deepEqual(data.traces.groups[1].parents, [])
  t.equal(data.traces.groups[1].signature, 'transaction')
  t.equal(data.traces.groups[1].transaction, 'foo' + transNo)

  // data.transactions:
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'foo' + transNo)
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)

  // data.traces.raw:
  //
  // [
  //   [
  //     59.695363,                  // total transaction time
  //     [ 0, 31.647005, 18.31168 ], // sql trace (version)
  //     [ 1, 48.408276, 4.157207 ], // sql trace (select)
  //     [ 2, 0, 59.695363 ],        // root trace
  //     { extra: [Object] }         // extra
  //   ]
  // ]
  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, selectVersion ? 5 : 4)
  t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
  t.equal(data.traces.raw[0][1].length, 3)
  t.equal(data.traces.raw[0][2].length, 3)
  if (selectVersion) t.equal(data.traces.raw[0][3].length, 3)

  for (var rawNo = 1; rawNo <= (selectVersion ? 2 : 1); rawNo++) {
    t.equal(data.traces.raw[0][rawNo][0], rawNo - 1)
    t.ok(data.traces.raw[0][rawNo][1] > 0)
    t.ok(data.traces.raw[0][rawNo][2] > 0)
    t.ok(data.traces.raw[0][rawNo][1] < data.traces.raw[0][0])
    t.ok(data.traces.raw[0][rawNo][2] < data.traces.raw[0][0])
  }

  t.equal(data.traces.raw[0][rawNo][0], rawNo - 1)
  t.equal(data.traces.raw[0][rawNo][1], 0)
  t.equal(data.traces.raw[0][rawNo][2], data.traces.raw[0][0])

  t.ok('extra' in data.traces.raw[0][rawNo + 1])
}

function createClient (cb) {
  setup(function () {
    knex = Knex({
      client: 'pg',
      connection: 'postgres://localhost/test_opbeat'
    })
    cb()
  })
}

function setup (cb) {
  // just in case it didn't happen at the end of the previous test
  teardown(function () {
    exec('psql -d postgres -f pg_reset.sql', { cwd: __dirname }, function (err) {
      if (err) throw err
      exec('psql -d test_opbeat -f pg_data.sql', { cwd: __dirname }, function (err) {
        if (err) throw err
        cb()
      })
    })
  })
}

function teardown (cb) {
  if (knex) {
    knex.destroy(function (err) {
      if (err) throw err
      knex = undefined
      cb()
    })
  } else {
    process.nextTick(cb)
  }
}

function resetAgent (cb) {
  agent._httpClient = { request: function () {
    var self = this
    var args = arguments
    teardown(function () {
      cb.apply(self, args)
    })
  } }
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
