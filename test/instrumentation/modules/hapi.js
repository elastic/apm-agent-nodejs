'use strict'

var agent = require('../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  logLevel: 'fatal'
})

var test = require('tape')
var http = require('http')
var Hapi = require('hapi')

var originalCaptureError = agent.captureError

test('extract URL from request', function (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    var request = data.errors[0].context.request
    t.equal(request.method, 'GET')
    t.equal(request.url.pathname, '/captureError')
    t.equal(request.url.search, '?foo=bar')
    t.equal(request.url.raw, '/captureError?foo=bar')
    t.equal(request.url.hostname, 'localhost')
    t.equal(request.url.port, String(server.info.port))
    t.equal(request.socket.encrypted, false)
    server.stop()
    t.end()
  })

  agent.captureError = originalCaptureError

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/captureError?foo=bar')
  })
})

test('route naming', function (t) {
  t.plan(8)

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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(opts.custom.data instanceof Error)
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(typeof opts.custom.data === 'string')
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.deepEqual(opts.custom.data, customError)
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(opts.custom.data instanceof Error)
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(opts.custom.data instanceof Error)
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(typeof opts.custom.data === 'string')
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
    t.ok(opts.custom)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.deepEqual(opts.custom.data, customError)
  }

  var server = new Hapi.Server()
  server.connection()

  server.start(function (err) {
    t.error(err, 'start error')

    server.log(['error'], customError)
  })
})

test('request error logging with Error', function (t) {
  t.plan(14)

  var customError = new Error('custom error')

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.custom)
    t.ok(opts.request)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(opts.custom.data instanceof Error)
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
  t.plan(16)

  var customError = new Error('custom error')

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.custom)
    t.ok(opts.request)
    t.deepEqual(opts.custom.tags, ['elastic-apm', 'error'])
    t.false(opts.custom.internals)
    t.ok(opts.custom.data instanceof Error)
  }

  var server = new Hapi.Server()
  server.connection()

  server.route({
    method: 'GET',
    path: '/error',
    handler: function (request, reply) {
      request.log(['elastic-apm', 'error'], customError)

      return reply('hello world')
    }
  })

  server.on('request', function (req, event, tags) {
    t.deepEqual(event.tags, ['elastic-apm', 'error'])
  })

  server.start(function (err) {
    t.error(err, 'start error')

    server.on('request', function (req, event, tags) {
      t.deepEqual(event.tags, ['elastic-apm', 'error'])
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
  t.plan(14)

  var customError = 'custom error'

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, customError)
    t.ok(opts.custom)
    t.ok(opts.request)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.ok(typeof opts.custom.data === 'string')
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
  t.plan(14)

  var customError = {
    error: 'I forgot to turn this into an actual Error'
  }

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' })

    server.stop()
  })

  agent.captureError = function (err, opts) {
    t.equal(err, 'hapi server emitted a request event tagged error')
    t.ok(opts.custom)
    t.ok(opts.request)
    t.deepEqual(opts.custom.tags, ['error'])
    t.false(opts.custom.internals)
    t.deepEqual(opts.custom.data, customError)
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
  t.plan(10)

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, { status: 'HTTP 5xx', name: 'GET /error' })
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
  server.route({
    method: 'GET',
    path: '/captureError',
    handler: function (request, reply) {
      agent.captureError(new Error())
      return reply()
    }
  })
  return server
}

function assert (t, data, results) {
  if (!results) results = {}
  results.status = results.status || 'HTTP 2xx'
  results.name = results.name || 'GET /hello'

  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, results.name)
  t.equal(trans.type, 'request')
  t.equal(trans.result, results.status)
  t.equal(trans.spans.length, 0)
  t.equal(trans.context.request.method, 'GET')
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._instrumentation._queue._clear()
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
