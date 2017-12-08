'use strict'

var agent = require('../../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')
var version = require('koa-router/package').version
var koaVersion = require('koa/package').version

if (semver.gte(koaVersion, '2.0.0') && semver.lt(process.version, '6.0.0')) process.exit()

var test = require('tape')
var http = require('http')
var Koa = require('koa')
var Router = require('koa-router')

test('route naming', function (t) {
  t.plan(8)

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data)
    server.close()
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

test('route naming with params', function (t) {
  t.plan(8)

  resetAgent(function (endpoint, headers, data, cb) {
    assert(t, data, {name: 'GET /hello/:name'})
    server.close()
  })

  var server = startServer(function (port) {
    http.get('http://localhost:' + port + '/hello/thomas', function (res) {
      t.equal(res.statusCode, 200)
      res.on('data', function (chunk) {
        t.equal(chunk.toString(), 'hello thomas')
      })
      res.on('end', function () {
        agent._instrumentation._queue._flush()
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

  if (semver.lt(version, '6.0.0')) {
    require('./_generators')(router)
  } else if (semver.gte(version, '6.0.0')) {
    require('./_non-generators')(router)
  }

  app
    .use(router.routes())
    .use(router.allowedMethods())

  return http.createServer(app.callback())
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
