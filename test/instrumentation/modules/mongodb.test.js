'use strict'

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

// require('mongodb') is a hard crash on node 8
const mongodbVersion = require('../../../node_modules/mongodb/package.json').version
const semver = require('semver')
if (semver.gte(mongodbVersion, '4.0.0') && semver.lt(process.version, '10.0.0')) {
  console.log(`# SKIP mongodb@${mongodbVersion} does not support node ${process.version}`)
  process.exit()
}
const MongoClient = require('mongodb').MongoClient
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
      const insertedCount = getInsertedCountFromResults(results)
      t.strictEqual(insertedCount, 3, 'inserted three records')

      // If records have been inserted, they should be cleaned up
      t.on('end', () => {
        collection.deleteMany({}, { w: 1 }, function () {
          _server.close()
        })
      })

      collection.updateOne({ a: 1 }, { $set: { b: 1 } }, { w: 1 }, function (err, results) {
        t.error(err, 'no update error')
        const count = getMatchedCountFromResults(results)
        t.strictEqual(count, 1, 'updated one record')

        collection.deleteOne({ a: 1 }, { w: 1 }, function (err, results) {
          t.error(err, 'no delete error')
          const count = getDeletedCountFromResults(results)
          t.strictEqual(count, 1, 'deleted one record')

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

      // We can't easily assert destination.address because mongodb >3.5.0
      // returns a resolved IP for the given connection hostname. In our CI
      // setup, the host is set to "mongodb" which is a Docker container with
      // some IP. We could `dns.resolve4()` here, but that's overkill I think.
      t.ok(span.context.destination.address, 'context.destination.address is defined')
      t.deepEqual(span.context.destination, {
        service: {
          name: 'mongodb',
          resource: 'mongodb',
          type: 'db'
        },
        address: span.context.destination.address,
        port: 27017
      }, 'span.context.destination')
    }
  }
}

// MongoDB changed the structure of their results objects
// between version 3 and version 4
function getInsertedCountFromResults (results) {
  return results.result ? results.result.n : results.insertedCount
}

function getMatchedCountFromResults (results) {
  return results.result ? results.result.n : results.matchedCount
}

function getDeletedCountFromResults (results) {
  return results.result ? results.result.n : results.deletedCount
}

function resetAgent (expectations, cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expectations, cb)
  agent.captureError = function (err) { throw err }
}
