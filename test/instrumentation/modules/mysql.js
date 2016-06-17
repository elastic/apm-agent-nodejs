'use strict'

var agent = require('opbeat').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var execSync = require('child_process').execSync
var mysql = require('mysql')

var connection

test('mysql.createConnection', function (t) {
  t.test('basic query with callback', function (t) {
    t.test('connection.query(sql, callback)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      connection.query(sql, basicQueryCallback(t, trans))
    })

    t.test('connection.query(sql, values, callback)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      connection.query(sql, [1], basicQueryCallback(t, trans))
    })

    t.test('connection.query(options, callback)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      connection.query({ sql: sql }, basicQueryCallback(t, trans))
    })

    t.test('connection.query(options, values, callback)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      connection.query({ sql: sql }, [1], basicQueryCallback(t, trans))
    })

    t.test('connection.query(query)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      var query = mysql.createQuery(sql, basicQueryCallback(t, trans))
      connection.query(query)
    })

    t.test('connection.query(query_with_values)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      var query = mysql.createQuery(sql, [1], basicQueryCallback(t, trans))
      connection.query(query)
    })
  })

  t.test('basic query streaming', function (t) {
    t.test('connection.query(sql)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      var stream = connection.query(sql)
      basicQueryStream(stream, t, trans)
    })

    t.test('connection.query(sql, values)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      var stream = connection.query(sql, [1])
      basicQueryStream(stream, t, trans)
    })

    t.test('connection.query(options)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      var stream = connection.query({ sql: sql })
      basicQueryStream(stream, t, trans)
    })

    t.test('connection.query(options, values)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      var stream = connection.query({ sql: sql }, [1])
      basicQueryStream(stream, t, trans)
    })

    t.test('connection.query(query)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + 1 AS solution'
      var trans = agent.startTransaction('foo')
      var query = mysql.createQuery(sql)
      var stream = connection.query(query)
      basicQueryStream(stream, t, trans)
    })

    t.test('connection.query(query_with_values)', function (t) {
      resetAgent(function (endpoint, data, cb) {
        assertBasicQuery(t, sql, data)
        t.end()
      })
      setup()
      var sql = 'SELECT 1 + ? AS solution'
      var trans = agent.startTransaction('foo')
      var query = mysql.createQuery(sql, [1])
      var stream = connection.query(query)
      basicQueryStream(stream, t, trans)
    })
  })
})

function basicQueryCallback (t, trans) {
  return function (err, rows, fields) {
    t.error(err)
    t.equal(rows[0].solution, 2)
    trans.end()
    agent._instrumentation._send()
  }
}

function basicQueryStream (stream, t, trans) {
  var results = 0
  stream.on('error', function (err) {
    t.error(err)
  })
  stream.on('result', function (row) {
    results++
    t.equal(row.solution, 2)
  })
  stream.on('end', function () {
    t.equal(results, 1)
    trans.end()
    agent._instrumentation._send()
  })
}

function assertBasicQuery (t, sql, data) {
  t.equal(data.traces.groups.length, 2)

  t.equal(data.traces.groups[0].extra.sql, sql)
  t.equal(data.traces.groups[0].kind, 'db.mysql.query')
  t.deepEqual(data.traces.groups[0].parents, ['transaction'])
  t.equal(data.traces.groups[0].signature, 'SELECT')
  t.equal(data.traces.groups[0].transaction, 'foo')

  t.equal(data.traces.groups[1].kind, 'transaction')
  t.deepEqual(data.traces.groups[1].parents, [])
  t.equal(data.traces.groups[1].signature, 'transaction')
  t.equal(data.traces.groups[1].transaction, 'foo')

  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'foo')
}

function setup () {
  teardown() // just in case it didn't happen at the end of the previous test
  execSync('mysql -u root < mysql_reset.sql', { cwd: __dirname })
  connection = mysql.createConnection({
    user: 'root',
    database: 'test_opbeat'
  })
  connection.connect()
}

function teardown () {
  if (connection) {
    connection.end()
    connection = undefined
  }
}

function resetAgent (cb) {
  agent._httpClient = { request: function () {
    teardown()
    cb.apply(this, arguments)
  } }

  var ins = agent._instrumentation
  if (ins._timeout) {
    clearTimeout(ins._timeout)
    ins._timeout = null
  }
  ins._queue = []
}
