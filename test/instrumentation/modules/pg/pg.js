'use strict'

var agent = require('../../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')
var pgVersion = require('pg/package.json').version

// pg@7+ doesn't support Node.js pre 4.5.0
if (semver.lt(process.version, '4.5.0') && semver.gte(pgVersion, '7.0.0')) process.exit()

var test = require('tape')
var exec = require('child_process').exec
var pg = require('pg')

var queryable, connectionDone
var factories = [
  [createClient, 'client']
]

// In pg@6 native promises are required for pool operations
if (global.Promise || semver.satisfies(pgVersion, '<6')) factories.push([createPoolAndConnect, 'pool'])

factories.forEach(function (f) {
  var factory = f[0]
  var type = f[1]

  test('pg.' + factory.name, function (t) {
    t.test('basic query with callback', function (t) {
      t.test(type + '.query(sql, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query(sql, basicQueryCallback(t))
        })
      })

      t.test(type + '.query(sql, values, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query(sql, [1], basicQueryCallback(t))
        })
      })

      t.test(type + '.query(options, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query({ text: sql }, basicQueryCallback(t))
        })
      })

      t.test(type + '.query(options, values, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query({ text: sql }, [1], basicQueryCallback(t))
        })
      })

      t.test(type + '.query(options-with-values, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query({ text: sql, values: [1] }, basicQueryCallback(t))
        })
      })

      t.test(type + '.query(sql) - no callback', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql)
          setTimeout(function () {
            trans.end()
            agent._instrumentation._queue._flush()
          }, 250)
        })
      })
    })

    t.test('basic query streaming', function (t) {
      t.test(type + '.query(new Query(sql))', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query(new pg.Query(sql))
          basicQueryStream(stream, t)
        })
      })

      if (semver.gte(pgVersion, '7.0.0')) return

      t.test(type + '.query(sql)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query(sql)
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(sql, values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query(sql, [1])
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(options)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query({ text: sql })
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(options, values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query({ text: sql }, [1])
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(options-with-values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + $1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query({ text: sql, values: [1] })
          basicQueryStream(stream, t)
        })
      })
    })

    if (semver.gte(pgVersion, '5.1.0') && global.Promise) {
      t.test('basic query promise', function (t) {
        t.test(type + '.query(sql)', function (t) {
          resetAgent(function (endpoint, headers, data, cb) {
            assertBasicQuery(t, sql, data)
            t.end()
          })
          var sql = 'SELECT 1 + 1 AS solution'
          factory(function () {
            agent.startTransaction('foo')
            var p = queryable.query(sql)
            basicQueryPromise(p, t)
          })
        })

        t.test(type + '.query(sql, values)', function (t) {
          resetAgent(function (endpoint, headers, data, cb) {
            assertBasicQuery(t, sql, data)
            t.end()
          })
          var sql = 'SELECT 1 + $1 AS solution'
          factory(function () {
            agent.startTransaction('foo')
            var p = queryable.query(sql, [1])
            basicQueryPromise(p, t)
          })
        })

        t.test(type + '.query(options)', function (t) {
          resetAgent(function (endpoint, headers, data, cb) {
            assertBasicQuery(t, sql, data)
            t.end()
          })
          var sql = 'SELECT 1 + 1 AS solution'
          factory(function () {
            agent.startTransaction('foo')
            var p = queryable.query({ text: sql })
            basicQueryPromise(p, t)
          })
        })

        t.test(type + '.query(options, values)', function (t) {
          resetAgent(function (endpoint, headers, data, cb) {
            assertBasicQuery(t, sql, data)
            t.end()
          })
          var sql = 'SELECT 1 + $1 AS solution'
          factory(function () {
            agent.startTransaction('foo')
            var p = queryable.query({ text: sql }, [1])
            basicQueryPromise(p, t)
          })
        })

        t.test(type + '.query(options-with-values)', function (t) {
          resetAgent(function (endpoint, headers, data, cb) {
            assertBasicQuery(t, sql, data)
            t.end()
          })
          var sql = 'SELECT 1 + $1 AS solution'
          factory(function () {
            agent.startTransaction('foo')
            var p = queryable.query({ text: sql, values: [1] })
            basicQueryPromise(p, t)
          })
        })
      })
    }

    t.test('simultaneous queries', function (t) {
      t.test('on same connection', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          t.equal(data.transactions.length, 1)

          var trans = data.transactions[0]

          t.equal(trans.name, 'foo')
          t.equal(trans.traces.length, 3)
          trans.traces.forEach(function (trace) {
            t.equal(trace.name, 'SELECT')
            t.equal(trace.type, 'db.postgresql.query')
            t.deepEqual(trace.context.db, {statement: sql, type: 'sql'})
          })

          t.end()
        })

        var sql = 'SELECT 1 + $1 AS solution'

        factory(function () {
          var n = 0
          var trans = agent.startTransaction('foo')

          queryable.query(sql, [1], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 2)
            if (++n === 3) done()
          })
          queryable.query(sql, [2], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 3)
            if (++n === 3) done()
          })
          queryable.query(sql, [3], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 4)
            if (++n === 3) done()
          })

          function done () {
            trans.end()
            agent._instrumentation._queue._flush()
          }
        })
      })
    })

    t.test('simultaneous transactions', function (t) {
      resetAgent(function (endpoint, headers, data, cb) {
        t.equal(data.transactions.length, 3)
        var names = data.transactions.map(function (trans) {
          return trans.name
        }).sort()
        t.deepEqual(names, ['bar', 'baz', 'foo'])

        data.transactions.forEach(function (trans) {
          t.equal(trans.traces.length, 1)
          t.equal(trans.traces[0].name, 'SELECT')
          t.equal(trans.traces[0].type, 'db.postgresql.query')
          t.deepEqual(trans.traces[0].context.db, {statement: sql, type: 'sql'})
        })

        t.end()
      })

      var sql = 'SELECT 1 + $1 AS solution'

      factory(function () {
        var n = 0

        setImmediate(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql, [1], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 2)
            trans.end()
            if (++n === 3) done()
          })
        })

        setImmediate(function () {
          var trans = agent.startTransaction('bar')
          queryable.query(sql, [2], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 3)
            trans.end()
            if (++n === 3) done()
          })
        })

        setImmediate(function () {
          var trans = agent.startTransaction('baz')
          queryable.query(sql, [3], function (err, result, fields) {
            t.error(err)
            t.equal(result.rows[0].solution, 4)
            trans.end()
            if (++n === 3) done()
          })
        })

        function done () {
          agent._instrumentation._queue._flush()
        }
      })
    })
  })
})

// In pg@6 native promises are required for pool operations
if (global.Promise || semver.satisfies(pgVersion, '<6')) {
  test('simultaneous queries on different connections', function (t) {
    resetAgent(function (endpoint, headers, data, cb) {
      t.equal(data.transactions.length, 1)

      var trans = data.transactions[0]

      t.equal(trans.name, 'foo')
      t.equal(trans.traces.length, 3)
      trans.traces.forEach(function (trace) {
        t.equal(trace.name, 'SELECT')
        t.equal(trace.type, 'db.postgresql.query')
        t.deepEqual(trace.context.db, {statement: sql, type: 'sql'})
      })

      t.end()
    })

    var sql = 'SELECT 1 + $1 AS solution'

    createPool(function (connector) {
      var n = 0
      var trans = agent.startTransaction('foo')

      connector(function (err, client, release) {
        t.error(err)
        client.query(sql, [1], function (err, result, fields) {
          t.error(err)
          t.equal(result.rows[0].solution, 2)
          if (++n === 3) done()
          release()
        })
      })
      connector(function (err, client, release) {
        t.error(err)
        client.query(sql, [2], function (err, result, fields) {
          t.error(err)
          t.equal(result.rows[0].solution, 3)
          if (++n === 3) done()
          release()
        })
      })
      connector(function (err, client, release) {
        t.error(err)
        client.query(sql, [3], function (err, result, fields) {
          t.error(err)
          t.equal(result.rows[0].solution, 4)
          if (++n === 3) done()
          release()
        })
      })

      function done () {
        trans.end()
        agent._instrumentation._queue._flush()
      }
    })
  })

  test('connection.release()', function (t) {
    resetAgent(function (endpoint, headers, data, cb) {
      assertBasicQuery(t, sql, data)
      lastRelease()
      t.end()
    })

    var sql = 'SELECT 1 + 1 AS solution'
    var lastRelease

    createPool(function (connector) {
      agent.startTransaction('foo')

      connector(function (err, client, release) {
        t.error(err)
        release()

        connector(function (err, client, release) {
          lastRelease = release
          t.error(err)
          client.query(sql, basicQueryCallback(t))
        })
      })
    })
  })
}

function basicQueryCallback (t) {
  return function queryCallback (err, result, fields) {
    t.error(err)
    t.equal(result.rows[0].solution, 2)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  }
}

function basicQueryStream (stream, t) {
  var results = 0
  stream.on('error', function (err) {
    t.error(err)
  })
  stream.on('row', function (row) {
    results++
    t.equal(row.solution, 2)
  })
  stream.on('end', function () {
    t.equal(results, 1)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  })
}

function basicQueryPromise (p, t) {
  p.catch(function (err) {
    t.error(err)
  })
  p.then(function (results) {
    t.equal(results.rows.length, 1)
    t.equal(results.rows[0].solution, 2)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  })
}

function assertBasicQuery (t, sql, data) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, 'foo')
  t.equal(trans.traces.length, 1)
  t.equal(trans.traces[0].name, 'SELECT')
  t.equal(trans.traces[0].type, 'db.postgresql.query')
  t.deepEqual(trans.traces[0].context.db, {statement: sql, type: 'sql'})
}

function createClient (cb) {
  setup(function () {
    queryable = new pg.Client({
      database: 'test_elastic_apm'
    })
    queryable.connect(function (err) {
      if (err) throw err
      cb()
    })
  })
}

function createPool (cb) {
  setup(function () {
    var connector

    if (semver.satisfies(pgVersion, '<6.0.0')) {
      queryable = pg // TODO: Can this be done?
      connector = function connector (cb) {
        var conString = 'postgres://localhost/test_elastic_apm'
        return pg.connect(conString, cb)
      }
    } else {
      var pool = new pg.Pool({
        database: 'test_elastic_apm'
      })
      queryable = pool // TODO: Can this be done?
      connector = function connector (cb) {
        return pool.connect(cb)
      }
    }

    cb(connector)
  })
}

function createPoolAndConnect (cb) {
  createPool(function (connector) {
    connector(function (err, client, done) {
      if (err) throw err
      queryable = client
      connectionDone = done
      cb()
    })
  })
}

function setup (cb) {
  teardown() // just in case it didn't happen at the end of the previous test
  exec('psql -d postgres -f pg_reset.sql', { cwd: __dirname }, function (err) {
    if (err) throw err
    cb()
  })
}

function teardown () {
  if (queryable) {
    if (connectionDone && semver.satisfies(pgVersion, '^5.2.1')) {
      // Version 5.2.1 doesn't release the connection back into the pool when
      // calling client.end(), so we'll instead drain the pool completely. This
      // takes a lot longer, so we don't wanna do this normally.
      //
      // For details see:
      // https://github.com/brianc/node-postgres/issues/1414
      // pg.end()
      connectionDone()
      connectionDone = undefined
    } else {
      queryable.end()
    }
    queryable = undefined
  }
}

function resetAgent (cb) {
  agent._httpClient = { request: function () {
    teardown()
    cb.apply(this, arguments)
  } }
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
