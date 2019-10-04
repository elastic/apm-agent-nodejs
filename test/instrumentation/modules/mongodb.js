'use strict'

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const MongoClient = require('mongodb').MongoClient
const test = require('tape')

const mockClient = require('../../_mock_http_client_states')

test('instrument simple command', function (t) {
  resetAgent([
    makeSpanTest(t, 'elasticapm.test.insert'),
    makeSpanTest(t, 'elasticapm.test.update'),
    makeSpanTest(t, 'elasticapm.test.delete'),
    makeSpanTest(t, 'elasticapm.test.find'),
    makeTransactionTest(t)
  ], function () {
    t.end()
  })

  const host = process.env.MONGODB_HOST || 'localhost'
  const url = `mongodb://${host}:27017`

  const server = new MongoClient(url, {
    useUnifiedTopology: true,
    useNewUrlParser: true
  })

  agent.startTransaction('foo', 'bar')

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.connect((err, _server) => {
    t.error(err, 'no connect error')
    t.ok(_server, 'got a valid server connection')

    const db = _server.db('elasticapm')
    const collection = db.collection('test')

    collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], { w: 1 }, function (err, results) {
      t.error(err, 'no insert error')
      t.equal(results.result.n, 3, 'inserted three records')

      // If records have been inserted, they should be cleaned up
      t.on('end', () => {
        collection.deleteMany({}, { w: 1 }, function () {
          _server.close()
        })
      })

      collection.updateOne({ a: 1 }, { $set: { b: 1 } }, { w: 1 }, function (err, results) {
        t.error(err, 'no update error')
        t.equal(results.result.n, 1, 'updated one record')

        collection.deleteOne({ a: 1 }, { w: 1 }, function (err, results) {
          t.error(err, 'no delete error')
          t.equal(results.result.n, 1, 'deleted one record')

          var cursor = collection.find({})

          cursor.next(function (err, doc) {
            t.error(err, 'no cursor next error')
            t.equal(doc.a, 2, 'found record #2')

            cursor.next(function (err, doc) {
              t.error(err, 'no cursor next error')
              t.equal(doc.a, 3, 'found record #3')

              agent.endTransaction()
              agent.flush()
            })
          })
        })
      })
    })
  })
})

function makeTransactionTest (t) {
  return {
    find (type) {
      return type === 'transaction'
    },
    test (trans) {
      t.equal(trans.name, 'foo', 'transaction name is "foo"')
      t.equal(trans.type, 'bar', 'transaction type is "bar"')
      t.equal(trans.result, 'success', 'transaction result is "success"')
    }
  }
}

function makeSpanTest (t, name) {
  return {
    find (type, span) {
      return type === 'span' && span.name === name
    },
    test (span) {
      t.ok(span, 'found valid span')
      t.equal(span.name, name, `span name is "${name}"`)
      t.equal(span.type, 'db', 'span type is "db"')
      t.equal(span.subtype, 'mongodb', 'span subtype is "mongodb"')
      t.equal(span.action, 'query', 'span action is "query"')
    }
  }
}

function resetAgent (expectations, cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expectations, cb)
  agent.captureError = function (err) { throw err }
}
