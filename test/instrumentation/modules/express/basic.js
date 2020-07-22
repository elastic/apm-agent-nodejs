'use strict'

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false
})

var http = require('http')

var express = require('express')
var test = require('tape')

var mockClient = require('../../../_mock_http_client')

var nestedRouteTestCases = [
  [], // no nesting
  ['/', ''],
  ['/sub', '/sub'],
  ['/sub/:id', '/sub/42']
]

var routeTestCases = [
  ['use', '/', 'GET', '/'],
  ['use', '/', 'POST', '/'],
  ['get', '/', 'GET', '/'],
  ['post', '/', 'POST', '/'],
  ['head', '/', 'HEAD', '/'],
  ['use', '/foo/:id', 'GET', '/foo/42'],
  ['use', '/foo/:id', 'POST', '/foo/42'],
  ['get', '/foo/:id', 'GET', '/foo/42'],
  ['post', '/foo/:id', 'POST', '/foo/42'],
  ['head', '/foo/:id', 'HEAD', '/foo/42']
]

function normalizePathElements (...elements) {
  return '/' + elements.join('/').split('/').filter(Boolean).join('/')
}

nestedRouteTestCases.forEach(function ([parentRoute = '', pathPrefix = ''] = []) {
  routeTestCases.forEach(function ([expressFn, route, method, path]) {
    path = normalizePathElements(pathPrefix, path)

    const testName = parentRoute
      ? `app.use('${parentRoute}') => app.${expressFn}('${route}') - ${method} ${path}`
      : `app.${expressFn}('${route}') - ${method} ${path}`

    test(testName, function (t) {
      t.plan(5)

      resetAgent(function (data) {
        t.strictEqual(data.transactions.length, 1, 'has a transaction')
        const trans = data.transactions[0]
        const transName = (expressFn === 'use' && path === '/')
          ? `${method} unknown route`
          : `${method} ${normalizePathElements(parentRoute, route)}`
        t.strictEqual(trans.name, transName, 'transaction name is ' + transName)
        t.strictEqual(trans.type, 'request', 'transaction type is request')
      })

      const app = express()
      app.set('env', 'production')

      let router
      if (parentRoute) {
        router = new express.Router()
        app.use(parentRoute, router)
      } else {
        router = app
      }

      router[expressFn](route, function (req, res) {
        res.send('foo')
      })

      const server = app.listen(function () {
        get(server, { method, path }, (err, body) => {
          t.error(err)
          t.strictEqual(body, method === 'HEAD' ? '' : 'foo', 'should have expected response body')
          server.close()
          agent.flush()
        })
      })
    })
  })
})

test('error intercept', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /', 'transaction name is GET /')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var request
  var error = new Error('wat')
  var captureError = agent.captureError
  agent.captureError = function (err, data) {
    t.strictEqual(err, error, 'has the expected error')
    t.ok(data, 'captured data with error')
    t.strictEqual(data.request, request, 'captured data has the request object')
  }
  t.on('end', function () {
    agent.captureError = captureError
  })

  var app = express()
  app.set('env', 'production')

  app.get('/', function (req, res, next) {
    request = req
    next(error)
  })

  app.use(function (error, req, res, next) {
    res.status(200).json({ error: error.message })
  })

  var server = app.listen(function () {
    get(server, { path: '/' }, (err, body) => {
      t.error(err)
      const expected = JSON.stringify({ error: error.message })
      t.strictEqual(body, expected, 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('ignore 404 errors', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET unknown route', 'transaction name is GET unknown route')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var captureError = agent.captureError
  agent.captureError = function (_, data) {
    t.fail('it should not capture 404 errors')
  }
  t.on('end', function () {
    agent.captureError = captureError
  })

  var app = express()
  app.set('env', 'production')

  app.use(function (req, res) {
    res.status(404).send('not found')
  })

  var server = app.listen(function () {
    get(server, { path: '/' }, (err, body) => {
      t.error(err)
      t.strictEqual(body, 'not found', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('ignore invalid errors', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /', 'transaction name is GET /')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var captureError = agent.captureError
  agent.captureError = function (_, data) {
    t.fail('should not capture invalid errors')
  }
  t.on('end', function () {
    agent.captureError = captureError
  })

  var app = express()
  app.set('env', 'production')

  app.get('/', function (req, res, next) {
    next(123)
  })

  app.use(function (_, req, res, next) {
    res.status(200).send('done')
  })

  var server = app.listen(function () {
    get(server, { path: '/' }, (err, body) => {
      t.error(err)
      t.strictEqual(body, 'done', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('do not inherit past route names', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /', 'transaction name is GET /')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var captureError = agent.captureError
  agent.captureError = function (_, data) {
    t.fail('should not capture invalid errors')
  }
  t.on('end', function () {
    agent.captureError = captureError
  })

  var app = express()
  app.set('env', 'production')

  app.get('/', function (req, res, next) {
    req.message = 'done'
    next()
  })

  app.use(function (req, res) {
    res.status(200).send(req.message)
  })

  var server = app.listen(function () {
    get(server, { path: '/' }, (err, body) => {
      t.error(err)
      t.strictEqual(body, 'done', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('sub-routers include base path', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var captureError = agent.captureError
  agent.captureError = function (_, data) {
    t.fail('should not capture invalid errors')
  }
  t.on('end', function () {
    agent.captureError = captureError
  })

  var router = express.Router()
  router.get('/:name', (req, res) => {
    res.end(`hello, ${req.params.name}`)
  })

  var app = express()
  app.set('env', 'production')
  app.use('/hello', router)

  var server = app.listen(function () {
    get(server, { path: '/hello/world' }, (err, body) => {
      t.error(err)
      t.strictEqual(body, 'hello, world', 'got correct body')
      server.close()
      agent.flush()
    })
  })
})

test('sub-routers throw exception', function (t) {
  t.plan(4)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.strictEqual(trans.name, 'GET /api/:name', 'transaction name is GET /api/:name')
    t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  var error = new Error('hello')
  var captureError = agent.captureError
  agent.captureError = function () {}
  t.on('end', function () {
    agent.captureError = captureError
  })

  var router = express.Router()
  router.get('/:name', (req, res) => {
    throw error
  })

  var app = express()
  app.set('env', 'production')
  app.use('/api', router)

  var server = app.listen(function () {
    get(server, { path: '/api/data' }, (err, body) => {
      t.error(err)
      server.close()
      agent.flush()
    })
  })
})

// The `express-slash` module expects that it can access the `stack` property
// on app.use sub-route handles.
test('expose app.use handle properties', function (t) {
  t.plan(7)

  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1, 'has a transaction')
  })

  const handle = function (req, res) {
    const stack = req.app._router.stack
    const handle = stack[stack.length - 1].handle

    t.ok(Array.isArray(handle.stack), 'expose stack array on handle')
    t.strictEqual(handle.stack.length, 1, 'stack should contain one layer')

    const layer = handle.stack[0]
    t.strictEqual(layer.handle.foo, 1, 'expose foo property on sub-handle')
    t.strictEqual(layer.handle.bar, 2, 'expose bar property on sub-handle')

    res.send('hello world')
  }
  handle.foo = 1
  handle.bar = 2

  const app = express()
  const sub = new express.Router()

  sub.use(handle)
  app.use(sub)

  const server = app.listen(function () {
    get(server, { path: '/' }, (err, body) => {
      t.error(err)
      t.strictEqual(body, 'hello world')
      server.close()
      agent.flush()
    })
  })
})

function get (server, opts, cb) {
  Object.assign(opts, {
    port: server.address().port
  })
  var req = http.request(opts, function (res) {
    var chunks = []
    res.setEncoding('utf8')
    res.on('error', cb)
    res.on('data', chunks.push.bind(chunks))
    res.on('end', () => cb(null, chunks.join('')))
  })
  req.on('error', cb)
  req.end()
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}
