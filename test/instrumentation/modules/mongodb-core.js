'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var Server = require('mongodb-core').Server
var semver = require('semver')
var test = require('tape')
var version = require('mongodb-core/package').version

test('instrument simple command', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var trans = data.transactions[0]
    var groups

    t.equal(data.transactions.length, 1)

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.equal(trans.result, 'success')

    if (semver.lt(version, '2.0.0')) {
      // mongodb-core v1.x will sometimes perform two `ismaster` queries
      // towards the admin and/or the system database. This doesn't always
      // happen, but if it does, we'll accept it.
      if (trans.spans[0].name === 'admin.$cmd.ismaster') {
        groups = [
          'admin.$cmd.ismaster',
          'system.$cmd.ismaster',
          'elasticapm.$cmd.command',
          'elasticapm.test.insert',
          'elasticapm.$cmd.command',
          'elasticapm.test.update',
          'elasticapm.$cmd.command',
          'elasticapm.test.remove',
          'elasticapm.test.find',
          'system.$cmd.ismaster'
        ]
      } else if (trans.spans[1].name === 'system.$cmd.ismaster') {
        groups = [
          'system.$cmd.ismaster',
          'system.$cmd.ismaster',
          'elasticapm.$cmd.command',
          'elasticapm.test.insert',
          'elasticapm.$cmd.command',
          'elasticapm.test.update',
          'elasticapm.$cmd.command',
          'elasticapm.test.remove',
          'elasticapm.test.find',
          'system.$cmd.ismaster'
        ]
      } else {
        groups = [
          'system.$cmd.ismaster',
          'elasticapm.$cmd.command',
          'elasticapm.test.insert',
          'elasticapm.$cmd.command',
          'elasticapm.test.update',
          'elasticapm.$cmd.command',
          'elasticapm.test.remove',
          'elasticapm.test.find',
          'system.$cmd.ismaster'
        ]
      }
    } else {
      groups = [
        'system.$cmd.ismaster',
        'elasticapm.test.insert',
        'elasticapm.test.update',
        'elasticapm.test.remove',
        'elasticapm.test.find',
        'system.$cmd.ismaster'
      ]
    }

    t.equal(trans.spans.length, groups.length)

    groups.forEach(function (name, i) {
      t.equal(trans.spans[i].name, name)
      t.equal(trans.spans[i].type, 'db.mongodb.query')
      t.ok(trans.spans[i].start + trans.spans[i].duration < trans.duration)
    })

    t.end()
  })

  var server = new Server({ host: process.env.MONGODB_HOST })

  agent.startTransaction('foo', 'bar')

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.on('connect', function (_server) {
    _server.command('system.$cmd', { ismaster: true }, function (err, results) {
      t.error(err)
      t.equal(results.result.ismaster, true)

      _server.insert('elasticapm.test', [{ a: 1 }, { a: 2 }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
        t.error(err)
        t.equal(results.result.n, 2)

        _server.update('elasticapm.test', [{ q: { a: 1 }, u: { '$set': { b: 1 } } }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
          t.error(err)
          t.equal(results.result.n, 1)

          _server.remove('elasticapm.test', [{ q: { a: 1 }, limit: 1 }], { writeConcern: { w: 1 }, ordered: true }, function (err, results) {
            t.error(err)
            t.equal(results.result.n, 1)

            var cursor = _server.cursor('elasticapm.test', { find: 'elasticapm.test', query: { a: 2 } })

            cursor.next(function (err, doc) {
              t.error(err)
              t.equal(doc.a, 2)

              _server.command('system.$cmd', { ismaster: true }, function (err, result) {
                t.error(err)
                agent.endTransaction()
                _server.destroy()
                agent.flush()
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
