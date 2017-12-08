'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var http = require('http')
var express = require('express')

test('error intercept', function (t) {
  t.plan(7)

  resetAgent(function (endpoint, headers, data, cb) {
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
    var port = server.address().port
    var opts = {
      method: 'GET',
      port: port,
      path: '/'
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        const body = Buffer.concat(chunks).toString()
        t.equal(body, JSON.stringify({
          error: error.message
        }), 'got correct body from error handler middleware')
        server.close()
        agent._instrumentation._queue._flush()
      })
    })
    req.end()
  })
})

test('ignore 404 errors', function (t) {
  t.plan(4)

  resetAgent(function (endpoint, headers, data, cb) {
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
    var port = server.address().port
    var opts = {
      method: 'GET',
      port: port,
      path: '/'
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        const body = Buffer.concat(chunks).toString()
        t.equal(body, 'not found', 'got correct body from error handler middleware')
        server.close()
        agent._instrumentation._queue._flush()
      })
    })
    req.end()
  })
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
