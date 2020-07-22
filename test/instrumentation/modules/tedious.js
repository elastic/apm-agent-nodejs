'use strict'

// Don't test on travis, there is no mssql service
if (process.env.TRAVIS) process.exit()

const agent = require('../../../').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const semver = require('semver')
const tedious = require('tedious')
const test = require('tape')

const mockClient = require('../../_mock_http_client')
const version = require('tedious/package').version

let connection
const hostname = process.env.MSSQL_HOST || '127.0.0.1'

if (semver.gte(version, '4.0.0')) {
  connection = {
    server: hostname,
    authentication: {
      type: 'default',
      options: {
        userName: 'SA',
        password: process.env.SA_PASSWORD || 'Very(!)Secure'
      }
    }
  }
} else {
  connection = {
    server: hostname,
    userName: 'SA',
    password: process.env.SA_PASSWORD || 'Very(!)Secure'
  }
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

  resetAgent(2, function (data) {
    assertBasicQuery(t, sql, data)
    t.end()
  })

  withConnection(t).then((connection) => {
    agent.startTransaction('foo')

    const request = new tedious.Request(sql, (err, rowCount) => {
      t.error(err, 'no error')
      t.strictEqual(rowCount, 1, 'row count')
      agent.endTransaction()
    })

    request.on('row', (columns) => {
      t.strictEqual(columns[0].value, 1, 'column value')
    })

    connection.execSql(request)
  }, (err) => {
    t.error(err, 'no error')
    t.fail('unable to connect to mssql')
  })
})

test('prepare / execute', (t) => {
  const sql = 'select @value'

  resetAgent(3, function (data) {
    assertPreparedQuery(t, sql, data)
    t.end()
  })

  withConnection(t).then((connection) => {
    agent.startTransaction('foo')

    const request = new tedious.Request(sql, (err, rowCount) => {
      t.error(err, 'no error')
      t.strictEqual(rowCount, 1, 'row count')
      agent.endTransaction()
    })
    request.addParameter('value', tedious.TYPES.Int)

    request.on('row', (columns) => {
      t.strictEqual(columns[0].value, 42, 'column value')
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
  t.strictEqual(data.transactions.length, 1, 'transaction count')
  t.strictEqual(data.spans.length, spanCount, 'span count')

  var trans = data.transactions[0]
  t.strictEqual(trans.name, 'foo', 'transaction name')
}

function assertQuery (t, sql, span, name) {
  t.strictEqual(span.name, name, 'span name')
  t.strictEqual(span.type, 'db', 'span type')
  t.strictEqual(span.subtype, 'mssql', 'span subtype')
  t.strictEqual(span.action, 'query', 'span action')
  t.deepEqual(span.context.db, {
    statement: sql,
    type: 'sql'
  }, 'span db context')
  t.deepEqual(span.context.destination, {
    service: {
      name: 'mssql',
      resource: 'mssql',
      type: 'db'
    },
    address: hostname,
    port: 1433
  }, 'span destination context')
}

function assertBasicQuery (t, sql, data) {
  assertTransaction(t, sql, data, 1)
  assertQuery(t, sql, data.spans[0], 'SELECT')
}

function assertPreparedQuery (t, sql, data) {
  assertTransaction(t, sql, data, 2)

  var spans = sortSpansBy(data.spans, span => span.name)
  assertQuery(t, sql, spans[0], 'SELECT')
  assertQuery(t, sql, spans[1], 'SELECT (prepare)')
}

function sortSpansBy (spans, fn) {
  return spans.sort((a, b) => {
    return fn(a) > fn(b) ? 1 : fn(b) > fn(a) ? -1 : 0
  })
}

function resetAgent (expected, cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._transport.destroy) agent._transport.destroy()
  agent._transport = mockClient(expected, cb)
  agent._instrumentation.currentTransaction = null
}
