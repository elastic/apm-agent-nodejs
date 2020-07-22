'use strict'

module.exports = (moduleName) => {
  var agent = require('../../../..').start({
    serviceName: 'test',
    secretToken: 'test',
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false
  })

  var routerVersion = require(`${moduleName}/package`).version

  var http = require('http')

  var Koa = require('koa')
  var semver = require('semver')
  var test = require('tape')

  var Router = require(moduleName)

  var mockClient = require('../../../_mock_http_client')

  test('route naming', function (t) {
    t.plan(8)

    resetAgent(function (data) {
      assert(t, data)
      server.close()
    })

    var server = startServer(function (port) {
      http.get('http://localhost:' + port + '/hello', function (res) {
        t.strictEqual(res.statusCode, 200)
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'hello world')
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
        t.strictEqual(res.statusCode, 200)
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'hello thomas')
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
        t.strictEqual(res.statusCode, 200)
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'hello world')
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
        t.strictEqual(res.statusCode, 200)
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'hello thomas')
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
      require('./_async-await')(router)
      require('./_async-await')(childRouter)

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

    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 0)

    var trans = data.transactions[0]

    t.strictEqual(trans.name, results.name)
    t.strictEqual(trans.type, 'request')
    t.strictEqual(trans.result, results.status)
    t.strictEqual(trans.context.request.method, 'GET')
  }

  function resetAgent (cb) {
    // first time this function is called, the real client will be present - so
    // let's just destroy it before creating the mock
    if (agent._transport.destroy) agent._transport.destroy()
    agent._instrumentation.currentTransaction = null
    agent._transport = mockClient(1, cb)
    agent.captureError = function (err) { throw err }
  }
}
