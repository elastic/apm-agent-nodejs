'use strict'

// Don't test on travis, there is no mssql service
if (process.env.TRAVIS) process.exit()

const agent = require('../../../').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

const tedious = require('tedious')
const test = require('tape')

const connection = process.env.APPVEYOR
  ? {
    userName: 'sa',
    password: 'Password12!',
    server: 'localhost',
    options: {
      database: 'master',
      encrypt: false,
      cryptoCredentialsDetails: {
        ciphers: 'RC4-MD5'
      }
    }
  }
  : {
    userName: 'SA',
    password: process.env.SA_PASSWORD || 'Very(!)Secure',
    server: process.env.MSSQL_HOST || '127.0.0.1'
  }

function withConnection (t) {
  return new Promise((resolve, reject) => {
    const conn = new tedious.Connection(connection)

    t.on('end', () => {
      conn.close()
    })

    conn.on('connect', (err) => {
      if (err) return reject(err)
      resolve(conn)
    })
  })
}

test('execSql', (t) => {
  const sql = 'select 1'

  resetAgent(function (endpoint, headers, data, cb) {
    assertBasicQuery(t, sql, data)
    t.end()
  })

  withConnection(t).then((connection) => {
    agent.startTransaction('foo')

    const request = new tedious.Request(sql, (err, rowCount) => {
      t.error(err, 'no error')
      t.equal(rowCount, 1, 'row count')
      agent.endTransaction()
      agent.flush()
    })

    request.on('row', (columns) => {
      t.equal(columns[0].value, 1, 'column value')
    })

    connection.execSql(request)
  }, (err) => {
    t.error(err, 'no error')
    t.fail('unable to connect to mssql')
  })
})

test('prepare / execute', (t) => {
  const sql = 'select @value'

  resetAgent(function (endpoint, headers, data, cb) {
    assertPreparedQuery(t, sql, data)
    t.end()
  })

  withConnection(t).then((connection) => {
    agent.startTransaction('foo')

    const request = new tedious.Request(sql, (err, rowCount) => {
      t.error(err, 'no error')
      t.equal(rowCount, 1, 'row count')
      agent.endTransaction()
      agent.flush()
    })
    request.addParameter('value', tedious.TYPES.Int)

    request.on('row', (columns) => {
      t.equal(columns[0].value, 42, 'column value')
    })

    request.on('prepared', function () {
      connection.execute(request, {
        value: 42
      })
    })

    connection.prepare(request)
  }, (err) => {
    t.error(err, 'no error')
    t.fail('unable to connect to mssql')
  })
})

function assertTransaction (t, sql, data, spanCount) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]
  t.equal(trans.name, 'foo', 'transaction name')
  t.equal(trans.spans.length, spanCount, 'span count')
}

function assertQuery (t, sql, span, name) {
  t.equal(span.name, name, 'span name')
  t.equal(span.type, 'db.mssql.query', 'span type')
  t.deepEqual(span.context.db, {
    statement: sql,
    type: 'sql'
  }, 'span context')
}

function assertBasicQuery (t, sql, data) {
  assertTransaction(t, sql, data, 1)

  var trans = data.transactions[0]
  assertQuery(t, sql, trans.spans[0], 'SELECT')
}

function assertPreparedQuery (t, sql, data) {
  assertTransaction(t, sql, data, 2)

  var trans = data.transactions[0]
  var spans = sortSpansBy(trans.spans, span => span.name)
  assertQuery(t, sql, spans[0], 'SELECT')
  assertQuery(t, sql, spans[1], 'SELECT (prepare)')
}

function sortSpansBy (spans, fn) {
  return spans.sort((a, b) => {
    return fn(a) > fn(b) ? 1 : fn(b) > fn(a) ? -1 : 0
  })
}

function resetAgent (request) {
  agent._httpClient = { request }
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
