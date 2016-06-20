'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false,
  ff_mysql: true
})

var test = require('tape')
var exec = require('child_process').exec
var semver = require('semver')
var mysql = require('mysql')
var mysqlVersion = require('../../../node_modules/mysql/package.json').version

var queryable
var factories = [
  [createConnection, 'connection'],
  [createPool, 'pool'],
  [createPoolAndGetConnection, 'pool > connection'],
  [createPoolClusterAndGetConnection, 'poolCluster > connection'],
  [createPoolClusterAndGetConnectionViaOf, 'poolCluster > of > connection']
]

factories.forEach(function (f) {
  var factory = f[0]
  var type = f[1]

  // Prior to mysql v2.4 pool.query would not return a Query object.
  // See: https://github.com/mysqljs/mysql/pull/830
  var skipStreamTest = type === 'pool' && semver.satisfies(mysqlVersion, '<2.4.0')

  // Prior to mysql v2.2 pool.query required a callback.
  // See: https://github.com/mysqljs/mysql/pull/585
  var skipNoCallbackTest = type === 'pool' && semver.satisfies(mysqlVersion, '<2.2.0')

  test('mysql.' + factory.name, function (t) {
    t.test('basic query with callback', function (t) {
      t.test(type + '.query(sql, callback)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql, basicQueryCallback(t, trans))
        })
      })

      t.test(type + '.query(sql, values, callback)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql, [1], basicQueryCallback(t, trans))
        })
      })

      t.test(type + '.query(options, callback)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query({ sql: sql }, basicQueryCallback(t, trans))
        })
      })

      t.test(type + '.query(options, values, callback)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query({ sql: sql }, [1], basicQueryCallback(t, trans))
        })
      })

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var query = mysql.createQuery(sql, basicQueryCallback(t, trans))
          queryable.query(query)
        })
      })

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var query = mysql.createQuery(sql, [1], basicQueryCallback(t, trans))
          queryable.query(query)
        })
      })

      if (skipNoCallbackTest) return

      t.test(type + '.query(sql) - no callback', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql)
          setTimeout(function () {
            trans.end()
            agent._instrumentation._send()
          }, 100)
        })
      })
    })

    if (skipStreamTest) return

    t.test('basic query streaming', function (t) {
      t.test(type + '.query(sql)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var stream = queryable.query(sql)
          basicQueryStream(stream, t, trans)
        })
      })

      t.test(type + '.query(sql, values)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var stream = queryable.query(sql, [1])
          basicQueryStream(stream, t, trans)
        })
      })

      t.test(type + '.query(options)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var stream = queryable.query({ sql: sql })
          basicQueryStream(stream, t, trans)
        })
      })

      t.test(type + '.query(options, values)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var stream = queryable.query({ sql: sql }, [1])
          basicQueryStream(stream, t, trans)
        })
      })

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var query = mysql.createQuery(sql)
          var stream = queryable.query(query)
          basicQueryStream(stream, t, trans)
        })
      })

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (endpoint, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          var query = mysql.createQuery(sql, [1])
          var stream = queryable.query(query)
          basicQueryStream(stream, t, trans)
        })
      })
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
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)
}

function createConnection (cb) {
  setup(function () {
    teardown = function teardown () {
      if (queryable) {
        queryable.end()
        queryable = undefined
      }
    }

    queryable = mysql.createConnection({
      user: 'root',
      database: 'test_opbeat'
    })
    queryable.connect()

    cb()
  })
}

function createPool (cb) {
  setup(function () {
    teardown = function teardown () {
      if (pool) {
        pool.end()
        pool = undefined
      }
    }

    var pool = mysql.createPool({
      user: 'root',
      database: 'test_opbeat'
    })
    queryable = pool

    cb()
  })
}

function createPoolAndGetConnection (cb) {
  setup(function () {
    teardown = function teardown () {
      if (pool) {
        pool.end()
        pool = undefined
      }
    }

    var pool = mysql.createPool({
      user: 'root',
      database: 'test_opbeat'
    })
    pool.getConnection(function (err, conn) {
      if (err) throw err
      queryable = conn
      cb()
    })
  })
}

function createPoolClusterAndGetConnection (cb) {
  setup(function () {
    teardown = function teardown () {
      if (cluster) {
        cluster.end()
        cluster = undefined
      }
    }

    var cluster = mysql.createPoolCluster()
    cluster.add({
      user: 'root',
      database: 'test_opbeat'
    })
    cluster.getConnection(function (err, conn) {
      if (err) throw err
      queryable = conn
      cb()
    })
  })
}

function createPoolClusterAndGetConnectionViaOf (cb) {
  setup(function () {
    teardown = function teardown () {
      cluster.end()
    }

    var cluster = mysql.createPoolCluster()
    cluster.add({
      user: 'root',
      database: 'test_opbeat'
    })
    cluster.of('*').getConnection(function (err, conn) {
      if (err) throw err
      queryable = conn
      cb()
    })
  })
}

function setup (cb) {
  teardown() // just in case it didn't happen at the end of the previous test
  exec('mysql -u root < mysql_reset.sql', { cwd: __dirname }, function (err) {
    if (err) throw err
    cb()
  })
}

// placeholder variable to hold the teardown function created by the setup function
var teardown = function () {}

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
