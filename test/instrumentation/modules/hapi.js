'use strict'

var agent = require('../../..').start({
  appName: 'test',
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

test('connectionless', function (t) {
  t.plan(1)

  resetAgent()

  var server = new Hapi.Server()
  server.initialize(function (err) {
    server.stop()
    t.error(err, 'start error')
  })
})

test('connectionless server error logging with Error', function (t) {
  t.plan(6)

  var customError = new Error('custom error')

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, customError)
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(opts.extra.data instanceof Error)
  }

  var server = new Hapi.Server()

  server.initialize(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('connectionless server error logging with String', function (t) {
  t.plan(6)

  var customError = 'custom error'

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, customError)
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(typeof opts.extra.data === 'string')
  }

  var server = new Hapi.Server()

  server.initialize(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('connectionless server error logging with Object', function (t) {
  t.plan(6)

  var customError = {
    error: 'I forgot to turn this into an actual Error'
  }

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, 'hapi server emitted a log event tagged error')
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.deepEqual(opts.extra.data, customError)
  }

  var server = new Hapi.Server()

  server.initialize(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('server error logging with Error', function (t) {
  t.plan(6)

  var customError = new Error('custom error')

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, customError)
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(opts.extra.data instanceof Error)
  }

  var server = new Hapi.Server()
  server.connection()

  server.start(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('server error logging with Error does not affect event tags', function (t) {
  t.plan(8)

  var customError = new Error('custom error')

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, customError)
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(opts.extra.data instanceof Error)
  }

  var server = new Hapi.Server()
  server.connection()

  server.on('log', function (event, tags) {
    t.deepEqual(event.tags, ['error'])
  })

  server.start(function (err) {
    t.error(err, 'start error')

    server.on('log', function (event, tags) {
      t.deepEqual(event.tags, ['error'])
    })

    server.log(['error'], customError)
  })
})

test('server error logging with String', function (t) {
  t.plan(6)

  var customError = 'custom error'

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, customError)
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(typeof opts.extra.data === 'string')
  }

  var server = new Hapi.Server()
  server.connection()

  server.start(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('server error logging with Object', function (t) {
  t.plan(6)

  var customError = {
    error: 'I forgot to turn this into an actual Error'
  }

  resetAgent()

  agent.captureError = function (err, opts) {
    server.stop()

    t.equal(err, 'hapi server emitted a log event tagged error')
    t.ok(opts.extra)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.deepEqual(opts.extra.data, customError)
  }

  var server = new Hapi.Server()
  server.connection()

  server.start(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('request error logging with Error', function (t) {
  t.plan(25)

  var customError = new Error('custom error')

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 200, name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.extra)
    t.ok(opts.request)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(opts.extra.data instanceof Error)
  }

  var server = new Hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      request.log(['error'], customError)

      return reply('hello world')
    }
  })

  server.start(function (err) {
    t.error(err, 'start error')

    http.get('http://localhost:' + server.info.port + '/error', function (res) {
      t.equal(res.statusCode, 200)

      res.resume().on('end', function () {
        agent._instrumentation._queue._flush()
      })
    })
  })
})

test('request error logging with Error does not affect event tags', function (t) {
  t.plan(27)

  var customError = new Error('custom error')

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 200, name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.extra)
    t.ok(opts.request)
    t.deepEqual(opts.extra.tags, ['opbeat', 'error'])
    t.false(opts.extra.internals)
    t.ok(opts.extra.data instanceof Error)
  }

  var server = new Hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      request.log(['opbeat', 'error'], customError)

      return reply('hello world')
    }
  })

  server.on('request', function (req, event, tags) {
    t.deepEqual(event.tags, ['opbeat', 'error'])
  })

  server.start(function (err) {
    t.error(err, 'start error')

    server.on('request', function (req, event, tags) {
      t.deepEqual(event.tags, ['opbeat', 'error'])
    })

    http.get('http://localhost:' + server.info.port + '/error', function (res) {
      t.equal(res.statusCode, 200)

      res.resume().on('end', function () {
        agent._instrumentation._queue._flush()
      })
    })
  })
})

test('request error logging with String', function (t) {
  t.plan(25)

  var customError = 'custom error'

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 200, name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.extra)
    t.ok(opts.request)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.ok(typeof opts.extra.data === 'string')
  }

  var server = new Hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      request.log(['error'], customError)

      return reply('hello world')
    }
  })

  server.start(function (err) {
    t.error(err, 'start error')

    http.get('http://localhost:' + server.info.port + '/error', function (res) {
      t.equal(res.statusCode, 200)

      res.resume().on('end', function () {
        agent._instrumentation._queue._flush()
      })
    })
  })
})

test('request error logging with Object', function (t) {
  t.plan(25)

  var customError = {
    error: 'I forgot to turn this into an actual Error'
  }

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 200, name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'hapi server emitted a request event tagged error')
    t.ok(opts.extra)
    t.ok(opts.request)
    t.deepEqual(opts.extra.tags, ['error'])
    t.false(opts.extra.internals)
    t.deepEqual(opts.extra.data, customError)
  }

  var server = new Hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      request.log(['error'], customError)

      return reply('hello world')
    }
  })

  server.start(function (err) {
    t.error(err, 'start error')

    http.get('http://localhost:' + server.info.port + '/error', function (res) {
      t.equal(res.statusCode, 200)

      res.resume().on('end', function () {
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
//     { transaction: 'GET /hello', result: 200, kind: 'request', timestamp: '2016-07-15T10:14:00.000Z', durations: [ 20.051362 ] }
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
  t.equal(data.transactions[0].kind, 'request')
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
