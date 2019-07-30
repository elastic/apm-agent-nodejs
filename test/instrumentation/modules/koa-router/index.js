'use strict'

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var routerVersion = require('koa-router/package').version
var koaVersion = require('koa/package').version
var semver = require('semver')

if (semver.gte(koaVersion, '2.0.0') && semver.lt(process.version, '6.0.0')) process.exit()

var http = require('http')

var Koa = require('koa')
var Router = require('koa-router')
var test = require('tape')

var mockClient = require('../../../_mock_http_client')

test('route naming', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    assert(t, data)
    server.close()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/hello', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello world')
      })
    })
  })
})

test('route naming with params', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    assert(t, data, { name: 'GET /hello/:name' })
    server.close()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/hello/thomas', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello thomas')
      })
    })
  })
})

test('nested routes', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    assert(t, data, { name: 'GET /prefix1/prefix2/hello' })
    server.close()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/prefix1/prefix2/hello', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello world')
      })
    })
  })
})

test('nested routes with params', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    assert(t, data, { name: 'GET /prefix1/prefix2/hello/:name' })
    server.close()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/prefix1/prefix2/hello/thomas', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello thomas')
      })
    })
  })
})

function startServer (cb) {
  var server = buildServer()
  server.listen(function () {
    cb(server.address().port)
  })
  return server
}

function buildServer () {
  var app = new Koa()
  var router = new Router()
  var parentRouter = new Router()
  var childRouter = new Router({
    prefix: '/prefix2'
  })

  if (semver.gte(routerVersion, '6.0.0')) {
    if (semver.gte(process.version, '7.10.1')) {
      require('./_async-await')(router)
      require('./_async-await')(childRouter)
    } else {
      require('./_non-generators')(router)
      require('./_non-generators')(childRouter)
    }

    // Mount childRouter with a dummy pass-through middleware function. This is
    // just to make the final router layer stack more complicated.
    parentRouter.use('/prefix1', (ctx, next) => next(), childRouter.routes())
  } else {
    require('./_generators')(router)
    require('./_generators')(childRouter)

    parentRouter.use('/prefix1', childRouter.routes())
  }

  app
    .use(router.routes())
    .use(parentRouter.routes())
    .use(router.allowedMethods())

  return http.createServer(app.callback())
}

function assert (t, data, results) {
  if (!results) results = {}
  results.status = results.status || 'HTTP 2xx'
  results.name = results.name || 'GET /hello'

  t.equal(data.transactions.length, 1)
  t.equal(data.spans.length, 0)

  var trans = data.transactions[0]

  t.equal(trans.name, results.name)
  t.equal(trans.type, 'request')
  t.equal(trans.result, results.status)
  t.equal(trans.context.request.method, 'GET')
}

function resetAgent (cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._transport.destroy) agent._transport.destroy()
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
