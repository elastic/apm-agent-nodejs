'use strict'

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const MongoClient = require('mongodb').MongoClient
const mongodbVersion = require('mongodb/package.json').version
const semver = require('semver')
const test = require('tape')

const mockClient = require('../../_mock_http_client_states')

const host = process.env.MONGODB_HOST || 'localhost'
const url = `mongodb://${host}:27017`

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
      t.strictEqual(results.result.n, 3, 'inserted three records')

      // If records have been inserted, they should be cleaned up
      t.on('end', () => {
        collection.deleteMany({}, { w: 1 }, function () {
          _server.close()
        })
      })

      collection.updateOne({ a: 1 }, { $set: { b: 1 } }, { w: 1 }, function (err, results) {
        t.error(err, 'no update error')
        t.strictEqual(results.result.n, 1, 'updated one record')

        collection.deleteOne({ a: 1 }, { w: 1 }, function (err, results) {
          t.error(err, 'no delete error')
          t.strictEqual(results.result.n, 1, 'deleted one record')

          var cursor = collection.find({})

          cursor.next(function (err, doc) {
            t.error(err, 'no cursor next error')
            t.strictEqual(doc.a, 2, 'found record #2')

            cursor.next(function (err, doc) {
              t.error(err, 'no cursor next error')
              t.strictEqual(doc.a, 3, 'found record #3')

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
      t.strictEqual(trans.name, 'foo', 'transaction name is "foo"')
      t.strictEqual(trans.type, 'bar', 'transaction type is "bar"')
      t.strictEqual(trans.result, 'success', 'transaction result is "success"')
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
      t.strictEqual(span.name, name, `span name is "${name}"`)
      t.strictEqual(span.type, 'db', 'span type is "db"')
      t.strictEqual(span.subtype, 'mongodb', 'span subtype is "mongodb"')
      t.strictEqual(span.action, 'query', 'span action is "query"')

      var expectedAddress = host;
      if (host === 'localhost' && semver.satisfies(mongodbVersion, '>=3.5.0')) {
        // mongodb >3.5.0 normalizes "localhost" to "127.0.0.1" in the
        // "started" event.
        expectedAddress = '127.0.0.1'
      }
      t.deepEqual(span.context.destination, {
        service: {
          name: 'mongodb',
          resource: 'mongodb',
          type: 'db'
        },
        address: expectedAddress,
        port: 27017
      }, 'span.context.destination')
    }
  }
}

function resetAgent (expectations, cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expectations, cb)
  agent.captureError = function (err) { throw err }
}
