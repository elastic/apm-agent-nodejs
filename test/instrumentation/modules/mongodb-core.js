'use strict'

var agent = require('../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var Server = require('mongodb-core').Server

test('trace simple command', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var groups = [
      'system.$cmd.ismaster',
      // 'opbeat.$cmd.command', // only appears in mongodb-core 1.x
      'opbeat.test.insert',
      'opbeat.test.update',
      'opbeat.test.remove',
      'opbeat.test.find',
      'system.$cmd.ismaster'
    ]

    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.equal(trans.result, '200')

    t.equal(trans.traces.length, groups.length)

    groups.forEach(function (name, i) {
      t.equal(trans.traces[i].name, name)
      t.equal(trans.traces[i].type, 'db.mongodb.query')
      t.ok(trans.traces[i].start + trans.traces[i].duration < trans.duration)
    })

    t.end()
  })

  var server = new Server({})

  agent.startTransaction('foo', 'bar')

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.on('connect', function (_server) {
    _server.command('system.$cmd', {ismaster: true}, function (err, results) {
      t.error(err)
      t.equal(results.result.ismaster, true)

      _server.insert('opbeat.test', [{a: 1}, {a: 2}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
        t.error(err)
        t.equal(results.result.n, 2)

        _server.update('opbeat.test', [{q: {a: 1}, u: {'$set': {b: 1}}}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
          t.error(err)
          t.equal(results.result.n, 1)

          _server.remove('opbeat.test', [{q: {a: 1}, limit: 1}], {writeConcern: {w: 1}, ordered: true}, function (err, results) {
            t.error(err)
            t.equal(results.result.n, 1)

            var cursor = _server.cursor('opbeat.test', {find: 'opbeat.test', query: {a: 2}})

            cursor.next(function (err, doc) {
              t.error(err)
              t.equal(doc.a, 2)

              _server.command('system.$cmd', {ismaster: true}, function (err, result) {
                t.error(err)
                agent.endTransaction()
                _server.destroy()
                agent._instrumentation._queue._flush()
              })
            })
          })
        })
      })
    })
  })

  server.connect()
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
