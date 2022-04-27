'use strict'

const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false
})

const semver = require('semver')
const test = require('tape')
const version = require('cassandra-driver/package.json').version

const makeClient = require('./_utils')
const mockClient = require('../../../_mock_http_client')

const hasPromises = semver.satisfies(version, '>=3.2')

test('connect', function (t) {
  resetAgent(2, function (data) {
    t.strictEqual(data.transactions.length, 1, 'transaction count')
    t.strictEqual(data.spans.length, 1, 'span count')

    const trans = data.transactions[0]
    t.strictEqual(trans.name, 'foo', 'transaction name')
    assertConnectSpan(t, data.spans[0])

    t.end()
  })

  makeClient(t).then(client => {
    agent.startTransaction('foo')

    client.connect(assertCallback(t))
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
  })
})

if (hasPromises) {
  test('execute - promise', function (t) {
    const sql = 'SELECT key FROM system.local'
    const summary = 'SELECT FROM system.local'

    resetAgent(3, function (data) {
      assertBasicQuery(t, sql, summary, data)
      t.end()
    })

    makeClient(t).then(client => {
      agent.startTransaction('foo')

      assertPromise(t, client.execute(sql), function (rows) {
        t.strictEqual(rows.length, 1, 'number of rows')
        t.strictEqual(rows[0].key, 'local', 'result key')
      })
      t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
    })
  })
}

test('execute - callback', function (t) {
  const sql = 'SELECT key FROM system.local'
  const summary = 'SELECT FROM system.local'

  resetAgent(3, function (data) {
    assertBasicQuery(t, sql, summary, data)
    t.end()
  })

  makeClient(t).then(client => {
    agent.startTransaction('foo')

    client.execute(sql, assertCallback(t, function (rows) {
      t.strictEqual(rows.length, 1, 'number of rows')
      t.strictEqual(rows[0].key, 'local', 'result key')
    }))
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
  })
})

if (hasPromises) {
  test('batch - promise', function (t) {
    const sql = 'INSERT INTO test (id, text) VALUES (uuid(), ?)'
    const summary = 'Cassandra: Batch query'

    resetAgent(3, function (data) {
      t.strictEqual(data.transactions.length, 1, 'transaction count')
      t.strictEqual(data.spans.length, 2, 'span count')

      const trans = data.transactions[0]
      t.strictEqual(trans.name, 'foo', 'transaction name')
      assertConnectSpan(t, data.spans[0])
      const joined = `${sql};\n${sql}`
      assertSpan(t, joined, summary, data.spans[1])

      t.end()
    })

    const queries = [
      { query: sql, params: ['foo'] },
      { query: sql, params: ['bar'] }
    ]

    makeClient(t, { keyspace: 'test' }).then(client => {
      agent.startTransaction('foo')

      assertPromise(t, client.batch(queries))
      t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
    })
  })
}

test('batch - callback', function (t) {
  const sql = 'INSERT INTO test (id, text) VALUES (uuid(), ?)'
  const summary = 'Cassandra: Batch query'

  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1, 'transaction count')
    t.strictEqual(data.spans.length, 2, 'span count')

    const trans = data.transactions[0]
    t.strictEqual(trans.name, 'foo', 'transaction name')
    assertConnectSpan(t, data.spans[0])
    const joined = `${sql};\n${sql}`
    assertSpan(t, joined, summary, data.spans[1])

    t.end()
  })

  const queries = [
    { query: sql, params: ['foo'] },
    { query: sql, params: ['bar'] }
  ]

  makeClient(t, { keyspace: 'test' }).then(client => {
    agent.startTransaction('foo')

    client.batch(queries, assertCallback(t, function (err) {
      t.error(err, 'no error')
    }))
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
  })
})

test('eachRow', function (t) {
  const sql = 'SELECT key FROM system.local'
  const summary = 'SELECT FROM system.local'

  resetAgent(3, function (data) {
    assertBasicQuery(t, sql, summary, data)
    t.end()
  })

  makeClient(t).then(client => {
    agent.startTransaction('foo')

    client.eachRow(sql, [], (n, row) => {
      t.strictEqual(row.key, 'local', 'row key')
    }, (err) => {
      t.error(err, 'no error')
      agent.endTransaction()
    })
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
  })
})

test('stream', function (t) {
  const sql = 'SELECT key FROM system.local'
  const summary = 'SELECT FROM system.local'

  resetAgent(3, function (data) {
    assertBasicQuery(t, sql, summary, data)
    t.end()
  })

  makeClient(t).then(client => {
    agent.startTransaction('foo')

    const stream = client.stream(sql, [])
    t.ok(agent.currentSpan === null, 'no currentSpan in sync code after cassandra-driver client command')
    let rows = 0

    stream.on('readable', function () {
      let row
      while ((row = this.read())) {
        rows++
        t.strictEqual(row.key, 'local', 'row key')
      }
    })

    stream.on('error', function (err) {
      t.error(err, 'no error')
    })

    stream.on('end', function () {
      t.strictEqual(rows, 1, 'number of rows')
      agent.endTransaction()
    })
  })
})

function assertCallback (t, handle) {
  return function (err, result) {
    t.error(err, 'no error')
    if (handle) handle(result.rows)
    agent.endTransaction()
  }
}

function assertPromise (t, promise, handle) {
  const cb = assertCallback(t, handle)
  return promise.then(cb.bind(null, null), cb)
}

function assertBasicQuery (t, sql, summary, data) {
  t.strictEqual(data.transactions.length, 1, 'transaction count')
  t.strictEqual(data.spans.length, 2, 'span count')

  const trans = data.transactions[0]
  t.strictEqual(trans.name, 'foo', 'transaction name')

  assertConnectSpan(t, data.spans[0])
  assertSpan(t, sql, summary, data.spans[1])
}

function assertConnectSpan (t, span) {
  t.strictEqual(span.name, 'Cassandra: Connect', 'span name')
  t.strictEqual(span.type, 'db', 'span type')
  t.strictEqual(span.subtype, 'cassandra', 'span subtype')
  t.strictEqual(span.action, 'connect', 'span action')
}

function assertSpan (t, sql, summary, span) {
  t.strictEqual(span.name, summary, 'span name')
  t.strictEqual(span.type, 'db', 'span type')
  t.strictEqual(span.subtype, 'cassandra', 'span subtype')
  t.strictEqual(span.action, 'query', 'span action')
  t.deepEqual(span.context.db, {
    statement: sql,
    type: 'cassandra'
  }, 'database context')
}

function resetAgent (expected, cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._transport.destroy) agent._transport.destroy()
  agent._transport = mockClient(expected, cb)
  agent._instrumentation.testReset()
}
