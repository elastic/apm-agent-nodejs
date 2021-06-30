'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var Server = require('mongodb-core').Server
var semver = require('semver')
var test = require('tape')
var mongodbCoreVersion = require('mongodb-core/package').version

var mockClient = require('../../_mock_http_client')

test('instrument simple command', function (t) {
  // Because a variable number of events to the APM server is possible (see
  // the "Note ... additional spans" below), we cannot use the 'expected' arg
  // to `mockClient` here.
  resetAgent(function (data) {
    var expectedSpanNamesInOrder = [
      'system.$cmd.ismaster',
      'elasticapm.test.insert',
      'elasticapm.test.update',
      'elasticapm.test.remove',
      'elasticapm.test.find',
      'system.$cmd.ismaster'
    ]

    t.strictEqual(data.transactions.length, 1)
    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'bar')
    t.strictEqual(trans.result, 'success')

    // Ensure spans are sorted by start time.
    data.spans = data.spans.sort((a, b) => {
      return a.timestamp - b.timestamp
    })

    // Check that the APM server received the expected spans in order.
    //
    // Note that there might be some additional spans that we allow and ignore:
    // - mongodb-core@1.x always does a `admin.$cmd.ismaster` or
    //   `system.$cmd.ismaster` (the latter in for mongodb-core@<=1.2.22)
    //   command on initial connection. The APM agent captures this if
    //   asyncHooks=true.
    // - mongodb-core@1.x includes `elasticapm.$cmd.command` spans after the
    //   insert, update, and remove commands.
    for (var i = 0; i < data.spans.length; i++) {
      const span = data.spans[i]
      if (semver.lt(mongodbCoreVersion, '2.0.0')) {
        if (span.name === 'admin.$cmd.ismaster' && i === 0) {
          t.comment("ignore extra 'admin.$cmd.ismaster' captured span")
          continue
        } else if (span.name === 'system.$cmd.ismaster' && expectedSpanNamesInOrder[0] !== 'system.$cmd.ismaster') {
          t.comment("ignore extra 'system.$cmd.ismaster' captured span")
          continue
        } else if (span.name === 'elasticapm.$cmd.command') {
          t.comment("ignore extra 'elasticapm.$cmd.command' captured span")
          continue
        }
      }

      t.strictEqual(span.name, expectedSpanNamesInOrder[0],
        'captured span has expected name: ' + expectedSpanNamesInOrder[0])
      t.strictEqual(span.type, 'db', 'span has expected type')
      t.strictEqual(span.subtype, 'mongodb', 'span has expected subtype')
      t.strictEqual(span.action, 'query', 'span has expected action')
      var offset = span.timestamp - trans.timestamp
      t.ok(offset + span.duration * 1000 < trans.duration * 1000,
        `span ends (${span.timestamp / 1000 + span.duration}ms) before the transaction (${trans.timestamp / 1000 + trans.duration}ms)`)

      expectedSpanNamesInOrder.shift()
    }

    t.end()
  })

  var server = new Server({ host: process.env.MONGODB_HOST })

  agent.startTransaction('foo', 'bar')

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.on('connect', function (_server) {
    _server.command('system.$cmd', { ismaster: true }, function (err, results) {
      t.error(err)
      t.strictEqual(results.result.ismaster, true)

      _server.insert('elasticapm.test', [{ a: 1 }, { a: 2 }, { a: 3 }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
        t.error(err)
        t.strictEqual(results.result.n, 3)

        _server.update('elasticapm.test', [{ q: { a: 1 }, u: { $set: { b: 1 } } }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
          t.error(err)
          t.strictEqual(results.result.n, 1)

          _server.remove('elasticapm.test', [{ q: { a: 1 }, limit: 1 }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
            t.error(err)
            t.strictEqual(results.result.n, 1)

            var cursor = _server.cursor('elasticapm.test', { find: 'elasticapm.test', query: {} })

            cursor.next(function (err, doc) {
              t.error(err)
              t.strictEqual(doc.a, 2)

              cursor.next(function (err, doc) {
                t.error(err)
                t.strictEqual(doc.a, 3)

                _server.command('system.$cmd', { ismaster: true }, function (err, result) {
                  t.error(err)
                  agent.endTransaction()

                  // Cleanup
                  _server.remove('elasticapm.test', [{ q: {}, limit: 0 }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
                    if (err) throw err
                    _server.destroy()
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  server.connect()
})

function resetAgent (expected, cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
