'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')

// hapi doesn't work in versions of Node.js prior to v4
if (!semver.satisfies(process.version, '>=4')) process.exit()

var test = require('tape')
var http = require('http')
var Hapi = require('hapi')

test('route naming', function (t) {
  t.plan(19)

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data)
    server.stop()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/hello', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello world')
      })
      res.on('end', function () {
        agent._instrumentation._queue._flush()
      })
    })
  })
})

test('error handling', function (t) {
  t.plan(21)

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 500, name: 'GET /error' })
    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err.message, 'foo')
    t.ok(opts.request instanceof http.IncomingMessage)
  }

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/error', function (res) {
      t.equal(res.statusCode, 500)
      res.on('data', function (chunk) {
        var data = JSON.parse(chunk.toString())
        t.deepEqual(data, {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An internal server error occurred'
        })
      })
      res.on('end', function () {
        agent._instrumentation._queue._flush()
      })
    })
  })
})

function startServer (cb) {
  var server = buildServer()
  server.start(function (err) {
    if (err) throw err
    cb(server.info.port)
  })
  return server
}

function buildServer () {
  var server = new Hapi.Server()
  server.connection()
  server.route({
    method: 'GET',
    path: '/hello',
    handler: function (request, reply) {
      return reply('hello world')
    }
  })
  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      return reply(new Error('foo'))
    }
  })
  return server
}

// {
//   transactions: [
//     { transaction: 'GET /hello', result: 200, kind: 'web.http', timestamp: '2016-07-15T10:14:00.000Z', durations: [ 20.051362 ] }
//   ],
//   traces: {
//     groups: [
//       { transaction: 'GET /hello', signature: 'transaction', kind: 'transaction', timestamp: '2016-07-15T10:14:00.000Z', parents: [], extra: { _frames: [Object] } }
//     ],
//     raw: [
//       [ 20.051362, [ 0, 0, 20.051362 ] ]
//     ]
//   }
// }
function assert (t, data, results) {
  if (!results) results = {}
  results.status = results.status || 200
  results.name = results.name || 'GET /hello'

  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].kind, 'web.http')
  t.equal(data.transactions[0].result, results.status)
  t.equal(data.transactions[0].transaction, results.name)

  t.equal(data.traces.groups.length, 1)
  t.equal(data.traces.groups[0].kind, 'transaction')
  t.deepEqual(data.traces.groups[0].parents, [])
  t.equal(data.traces.groups[0].signature, 'transaction')
  t.equal(data.traces.groups[0].transaction, results.name)

  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, 3)
  t.equal(data.traces.raw[0][1].length, 3)
  t.equal(data.traces.raw[0][1][0], 0)
  t.equal(data.traces.raw[0][1][1], 0)
  t.equal(data.traces.raw[0][1][2], data.traces.raw[0][0])
  t.equal(data.traces.raw[0][2].http.method, 'GET')
  t.deepEqual(data.transactions[0].durations, [data.traces.raw[0][0]])
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._instrumentation._queue._clear()
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
