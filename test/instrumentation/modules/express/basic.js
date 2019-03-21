'use strict'

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: true
})

var http = require('http')

var express = require('express')
var test = require('tape')

var mockClient = require('../../../_mock_http_client')

test('error intercept', function (t) {
  t.plan(8)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET /', 'transaction name is GET /')
    t.equal(trans.type, 'request', 'transaction type is request')
  })

  var request
  var error = new Error('wat')
  var captureError = agent.captureError
  agent.captureError = function (err, data) {
    t.equal(err, error, 'has the expected error')
    t.ok(data, 'captured data with error')
    t.equal(data.request, request, 'captured data has the request object')
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
    get(server, '/', (err, body) => {
      t.error(err)
      const expected = JSON.stringify({ error: error.message })
      t.equal(body, expected, 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('ignore 404 errors', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET unknown route', 'transaction name is GET unknown route')
    t.equal(trans.type, 'request', 'transaction type is request')
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
    get(server, '/', (err, body) => {
      t.error(err)
      t.equal(body, 'not found', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('ignore invalid errors', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET /', 'transaction name is GET /')
    t.equal(trans.type, 'request', 'transaction type is request')
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
    get(server, '/', (err, body) => {
      t.error(err)
      t.equal(body, 'done', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('do not inherit past route names', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET /', 'transaction name is GET /')
    t.equal(trans.type, 'request', 'transaction type is request')
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
    get(server, '/', (err, body) => {
      t.error(err)
      t.equal(body, 'done', 'got correct body from error handler middleware')
      server.close()
      agent.flush()
    })
  })
})

test('sub-routers include base path', function (t) {
  t.plan(5)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    t.equal(trans.type, 'request', 'transaction type is request')
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
    get(server, '/hello/world', (err, body) => {
      t.error(err)
      t.equal(body, 'hello, world', 'got correct body')
      server.close()
      agent.flush()
    })
  })
})

test('sub-routers throw exception', function (t) {
  t.plan(6)

  resetAgent(function (data) {
    t.equal(data.transactions.length, 1, 'has a transaction')

    var trans = data.transactions[0]
    t.equal(trans.name, 'GET /api/:name', 'transaction name is GET /api/:name')
    t.equal(trans.type, 'request', 'transaction type is request')
  })

  var error = new Error('hello')
  var captureError = agent.captureError
  agent.captureError = function (err, data) {
    t.equal(err, error, 'has the expected error')
    t.ok(data, 'captured data with error')
  }
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
    get(server, '/api/data', (err, body) => {
      t.error(err)
      server.close()
      agent.flush()
    })
  })
})

function get (server, path, cb) {
  var port = server.address().port
  var opts = {
    method: 'GET',
    port: port,
    path
  }
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
