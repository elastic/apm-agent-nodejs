'use strict'

var agent = require('../../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var exec = require('child_process').exec
var semver = require('semver')
var mysql = require('mysql')
var mysqlVersion = require('../../../../node_modules/mysql/package.json').version

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
        var sql = 'SELECT 1 + ? AS solution'
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
          queryable.query({ sql: sql }, basicQueryCallback(t))
        })
      })

      t.test(type + '.query(options, values, callback)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          agent.startTransaction('foo')
          queryable.query({ sql: sql }, [1], basicQueryCallback(t))
        })
      })

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var query = mysql.createQuery(sql, basicQueryCallback(t))
          queryable.query(query)
        })
      })

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var query = mysql.createQuery(sql, [1], basicQueryCallback(t))
          queryable.query(query)
        })
      })

      if (skipNoCallbackTest) return

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
          }, 100)
        })
      })
    })

    if (skipStreamTest) return

    t.test('basic query streaming', function (t) {
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
        var sql = 'SELECT 1 + ? AS solution'
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
          var stream = queryable.query({ sql: sql })
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(options, values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var stream = queryable.query({ sql: sql }, [1])
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + 1 AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var query = mysql.createQuery(sql)
          var stream = queryable.query(query)
          basicQueryStream(stream, t)
        })
      })

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })
        var sql = 'SELECT 1 + ? AS solution'
        factory(function () {
          agent.startTransaction('foo')
          var query = mysql.createQuery(sql, [1])
          var stream = queryable.query(query)
          basicQueryStream(stream, t)
        })
      })
    })

    t.test('simultaneous queries', function (t) {
      t.test('on same connection', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          // data.traces.groups:
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

          // data.transactions:
          t.equal(data.transactions.length, 1)
          t.equal(data.transactions[0].transaction, 'foo')
          t.equal(data.transactions[0].durations.length, 1)
          t.ok(data.transactions[0].durations[0] > 0)

          // data.traces.raw:
          //
          // [
          //   [
          //     17.05574,                   // total transaction time
          //     [ 0, 1.922771, 10.838852 ], // sql trace 1
          //     [ 0, 3.41268, 12.03623 ],   // sql trace 2
          //     [ 0, 4.188621, 12.202625 ], // sql trace 3
          //     [ 1, 0, 17.05574 ]          // root trace
          //   ]
          // ]
          t.equal(data.traces.raw.length, 1)
          t.equal(data.traces.raw[0].length, 5)
          t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
          t.equal(data.traces.raw[0][1].length, 3)
          t.equal(data.traces.raw[0][2].length, 3)
          t.equal(data.traces.raw[0][3].length, 3)
          t.equal(data.traces.raw[0][4].length, 3)

          t.equal(data.traces.raw[0][1][0], 0)
          t.ok(data.traces.raw[0][1][1] > 0)
          t.ok(data.traces.raw[0][1][2] > 0)
          t.ok(data.traces.raw[0][1][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][1][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][2][0], 0)
          t.ok(data.traces.raw[0][2][1] > 0)
          t.ok(data.traces.raw[0][2][2] > 0)
          t.ok(data.traces.raw[0][2][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][2][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][3][0], 0)
          t.ok(data.traces.raw[0][3][1] > 0)
          t.ok(data.traces.raw[0][3][2] > 0)
          t.ok(data.traces.raw[0][3][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][3][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][4][0], 1)
          t.equal(data.traces.raw[0][4][1], 0)
          t.equal(data.traces.raw[0][4][2], data.traces.raw[0][0])

          t.end()
        })

        var sql = 'SELECT 1 + ? AS solution'

        factory(function () {
          var n = 0
          var trans = agent.startTransaction('foo')

          queryable.query(sql, [1], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 2)
            if (++n === 3) done()
          })
          queryable.query(sql, [2], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 3)
            if (++n === 3) done()
          })
          queryable.query(sql, [3], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 4)
            if (++n === 3) done()
          })

          function done () {
            trans.end()
            agent._instrumentation._queue._flush()
          }
        })
      })

      t.test('on different connections', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          // data.traces.groups:
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

          // data.transactions:
          t.equal(data.transactions.length, 1)
          t.equal(data.transactions[0].transaction, 'foo')
          t.equal(data.transactions[0].durations.length, 1)
          t.ok(data.transactions[0].durations[0] > 0)

          // data.traces.raw:
          //
          // [
          //   [
          //     17.05574,                   // total transaction time
          //     [ 0, 1.922771, 10.838852 ], // sql trace 1
          //     [ 0, 3.41268, 12.03623 ],   // sql trace 2
          //     [ 0, 4.188621, 12.202625 ], // sql trace 3
          //     [ 1, 0, 17.05574 ]          // root trace
          //   ]
          // ]
          t.equal(data.traces.raw.length, 1)
          t.equal(data.traces.raw[0].length, 5)
          t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
          t.equal(data.traces.raw[0][1].length, 3)
          t.equal(data.traces.raw[0][2].length, 3)
          t.equal(data.traces.raw[0][3].length, 3)
          t.equal(data.traces.raw[0][4].length, 3)

          t.equal(data.traces.raw[0][1][0], 0)
          t.ok(data.traces.raw[0][1][1] > 0)
          t.ok(data.traces.raw[0][1][2] > 0)
          t.ok(data.traces.raw[0][1][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][1][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][2][0], 0)
          t.ok(data.traces.raw[0][2][1] > 0)
          t.ok(data.traces.raw[0][2][2] > 0)
          t.ok(data.traces.raw[0][2][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][2][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][3][0], 0)
          t.ok(data.traces.raw[0][3][1] > 0)
          t.ok(data.traces.raw[0][3][2] > 0)
          t.ok(data.traces.raw[0][3][1] < data.traces.raw[0][0])
          t.ok(data.traces.raw[0][3][2] < data.traces.raw[0][0])

          t.equal(data.traces.raw[0][4][0], 1)
          t.equal(data.traces.raw[0][4][1], 0)
          t.equal(data.traces.raw[0][4][2], data.traces.raw[0][0])

          t.end()
        })

        var sql = 'SELECT 1 + ? AS solution'

        createPool(function () {
          var n = 0
          var trans = agent.startTransaction('foo')

          queryable.getConnection(function (err, conn) {
            t.error(err)
            conn.query(sql, [1], function (err, rows, fields) {
              t.error(err)
              t.equal(rows[0].solution, 2)
              if (++n === 3) done()
            })
          })
          queryable.getConnection(function (err, conn) {
            t.error(err)
            conn.query(sql, [2], function (err, rows, fields) {
              t.error(err)
              t.equal(rows[0].solution, 3)
              if (++n === 3) done()
            })
          })
          queryable.getConnection(function (err, conn) {
            t.error(err)
            conn.query(sql, [3], function (err, rows, fields) {
              t.error(err)
              t.equal(rows[0].solution, 4)
              if (++n === 3) done()
            })
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
        var fooIndex, barIndex, bazIndex
        for (var n = 0; n < 3; n++) {
          switch (data.transactions[n].transaction) {
            case 'foo':
              fooIndex = n
              break
            case 'bar':
              barIndex = n
              break
            case 'baz':
              bazIndex = n
              break
          }
        }

        // data.traces.groups:
        t.equal(data.traces.groups.length, 6)

        t.equal(data.traces.groups[fooIndex * 2].extra.sql, sql)
        t.equal(data.traces.groups[fooIndex * 2].kind, 'db.mysql.query')
        t.deepEqual(data.traces.groups[fooIndex * 2].parents, ['transaction'])
        t.equal(data.traces.groups[fooIndex * 2].signature, 'SELECT')
        t.equal(data.traces.groups[fooIndex * 2].transaction, 'foo')

        t.equal(data.traces.groups[fooIndex * 2 + 1].kind, 'transaction')
        t.deepEqual(data.traces.groups[fooIndex * 2 + 1].parents, [])
        t.equal(data.traces.groups[fooIndex * 2 + 1].signature, 'transaction')
        t.equal(data.traces.groups[fooIndex * 2 + 1].transaction, 'foo')

        t.equal(data.traces.groups[barIndex * 2].extra.sql, sql)
        t.equal(data.traces.groups[barIndex * 2].kind, 'db.mysql.query')
        t.deepEqual(data.traces.groups[barIndex * 2].parents, ['transaction'])
        t.equal(data.traces.groups[barIndex * 2].signature, 'SELECT')
        t.equal(data.traces.groups[barIndex * 2].transaction, 'bar')

        t.equal(data.traces.groups[barIndex * 2 + 1].kind, 'transaction')
        t.deepEqual(data.traces.groups[barIndex * 2 + 1].parents, [])
        t.equal(data.traces.groups[barIndex * 2 + 1].signature, 'transaction')
        t.equal(data.traces.groups[barIndex * 2 + 1].transaction, 'bar')

        t.equal(data.traces.groups[bazIndex * 2].extra.sql, sql)
        t.equal(data.traces.groups[bazIndex * 2].kind, 'db.mysql.query')
        t.deepEqual(data.traces.groups[bazIndex * 2].parents, ['transaction'])
        t.equal(data.traces.groups[bazIndex * 2].signature, 'SELECT')
        t.equal(data.traces.groups[bazIndex * 2].transaction, 'baz')

        t.equal(data.traces.groups[bazIndex * 2 + 1].kind, 'transaction')
        t.deepEqual(data.traces.groups[bazIndex * 2 + 1].parents, [])
        t.equal(data.traces.groups[bazIndex * 2 + 1].signature, 'transaction')
        t.equal(data.traces.groups[bazIndex * 2 + 1].transaction, 'baz')

        // data.transactions:
        t.equal(data.transactions.length, 3)
        t.equal(data.transactions[fooIndex].transaction, 'foo')
        t.equal(data.transactions[fooIndex].durations.length, 1)
        t.ok(data.transactions[fooIndex].durations[0] > 0)
        t.equal(data.transactions[barIndex].transaction, 'bar')
        t.equal(data.transactions[barIndex].durations.length, 1)
        t.ok(data.transactions[barIndex].durations[0] > 0)
        t.equal(data.transactions[bazIndex].transaction, 'baz')
        t.equal(data.transactions[bazIndex].durations.length, 1)
        t.ok(data.transactions[bazIndex].durations[0] > 0)

        // data.traces.raw:
        //
        // [
        //   [
        //     12.670418,                 // total transaction time
        //     [ 0, 0.90207, 10.712994 ], // sql trace
        //     [ 1, 0, 12.670418 ]        // root trace
        //   ],
        //   [
        //     13.269366,
        //     [ 2, 1.285107, 10.929622 ],
        //     [ 3, 0, 13.269366 ]
        //   ],
        //   [
        //     13.627345,
        //     [ 4, 1.214202, 11.254304 ],
        //     [ 5, 0, 13.627345 ]
        //   ]
        // ]
        t.equal(data.traces.raw.length, 3)

        t.equal(data.traces.raw[0].length, 3)
        t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
        t.equal(data.traces.raw[0][1].length, 3)
        t.equal(data.traces.raw[0][2].length, 3)

        t.equal(data.traces.raw[0][1][0], 0)
        t.ok(data.traces.raw[0][1][1] > 0)
        t.ok(data.traces.raw[0][1][2] > 0)
        t.ok(data.traces.raw[0][1][1] < data.traces.raw[0][0])
        t.ok(data.traces.raw[0][1][2] < data.traces.raw[0][0])

        t.equal(data.traces.raw[0][2][0], 1)
        t.equal(data.traces.raw[0][2][1], 0)
        t.equal(data.traces.raw[0][2][2], data.traces.raw[0][0])

        t.equal(data.traces.raw[1].length, 3)
        t.equal(data.traces.raw[1][0], data.transactions[1].durations[0])
        t.equal(data.traces.raw[1][1].length, 3)
        t.equal(data.traces.raw[1][2].length, 3)

        t.equal(data.traces.raw[1][1][0], 2)
        t.ok(data.traces.raw[1][1][1] > 0)
        t.ok(data.traces.raw[1][1][2] > 0)
        t.ok(data.traces.raw[1][1][1] < data.traces.raw[1][0])
        t.ok(data.traces.raw[1][1][2] < data.traces.raw[1][0])

        t.equal(data.traces.raw[1][2][0], 3)
        t.equal(data.traces.raw[1][2][1], 0)
        t.equal(data.traces.raw[1][2][2], data.traces.raw[1][0])

        t.equal(data.traces.raw[2].length, 3)
        t.equal(data.traces.raw[2][0], data.transactions[2].durations[0])
        t.equal(data.traces.raw[2][1].length, 3)
        t.equal(data.traces.raw[2][2].length, 3)

        t.equal(data.traces.raw[2][1][0], 4)
        t.ok(data.traces.raw[2][1][1] > 0)
        t.ok(data.traces.raw[2][1][2] > 0)
        t.ok(data.traces.raw[2][1][1] < data.traces.raw[2][0])
        t.ok(data.traces.raw[2][1][2] < data.traces.raw[2][0])

        t.equal(data.traces.raw[2][2][0], 5)
        t.equal(data.traces.raw[2][2][1], 0)
        t.equal(data.traces.raw[2][2][2], data.traces.raw[2][0])

        t.end()
      })

      var sql = 'SELECT 1 + ? AS solution'

      factory(function () {
        var n = 0

        setImmediate(function () {
          var trans = agent.startTransaction('foo')
          queryable.query(sql, [1], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 2)
            trans.end()
            if (++n === 3) done()
          })
        })

        setImmediate(function () {
          var trans = agent.startTransaction('bar')
          queryable.query(sql, [2], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 3)
            trans.end()
            if (++n === 3) done()
          })
        })

        setImmediate(function () {
          var trans = agent.startTransaction('baz')
          queryable.query(sql, [3], function (err, rows, fields) {
            t.error(err)
            t.equal(rows[0].solution, 4)
            trans.end()
            if (++n === 3) done()
          })
        })

        function done () {
          agent._instrumentation._queue._flush()
        }
      })
    })

    // Only pools have a getConnection function
    if (type === 'pool') {
      t.test('connection.release()', function (t) {
        resetAgent(function (endpoint, headers, data, cb) {
          assertBasicQuery(t, sql, data)
          t.end()
        })

        var sql = 'SELECT 1 + 1 AS solution'

        factory(function () {
          agent.startTransaction('foo')

          queryable.getConnection(function (err, conn) {
            t.error(err)
            conn.release()

            queryable.getConnection(function (err, conn) {
              t.error(err)
              conn.query(sql, basicQueryCallback(t))
            })
          })
        })
      })
    }
  })
})

function basicQueryCallback (t) {
  return function (err, rows, fields) {
    t.error(err)
    t.equal(rows[0].solution, 2)
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  }
}

function basicQueryStream (stream, t) {
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
    agent.endTransaction()
    agent._instrumentation._queue._flush()
  })
}

function assertBasicQuery (t, sql, data) {
  // data.traces.groups:
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

  // data.transactions:
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'foo')
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)

  // data.traces.raw:
  //
  // [
  //   [
  //     6.000953,                  // total transaction time
  //     [ 0, 1.185584, 3.121107 ], // sql trace
  //     [ 1, 0, 6.000953 ]         // root trace
  //   ]
  // ]
  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, 3)
  t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
  t.equal(data.traces.raw[0][1].length, 3)
  t.equal(data.traces.raw[0][2].length, 3)

  t.equal(data.traces.raw[0][1][0], 0)
  t.ok(data.traces.raw[0][1][1] > 0)
  t.ok(data.traces.raw[0][1][2] > 0)
  t.ok(data.traces.raw[0][1][1] < data.traces.raw[0][0])
  t.ok(data.traces.raw[0][1][2] < data.traces.raw[0][0])

  t.equal(data.traces.raw[0][2][0], 1)
  t.equal(data.traces.raw[0][2][1], 0)
  t.equal(data.traces.raw[0][2][2], data.traces.raw[0][0])
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
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
