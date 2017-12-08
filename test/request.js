'use strict'

var os = require('os')
var test = require('tape')
var http = require('http')
var Agent = require('./_agent')
var APMServer = require('./_apm_server')
var request = require('../lib/request')

var agentVersion = require('../package.json').version

test('#errors()', function (t) {
  t.test('envelope', function (t) {
    t.plan(13)
    var errors = [{}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.deepEqual(body.errors, errors)
        t.end()
      })
  })

  t.test('non-string log.message', function (t) {
    t.plan(13)
    var errors = [{log: {message: 1}}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.deepEqual(body.errors, errors)
        t.end()
      })
  })

  t.test('non-string exception.message', function (t) {
    t.plan(13)
    var errors = [{exception: {message: 1}}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.deepEqual(body.errors, errors)
        t.end()
      })
  })

  t.test('non-string culprit', function (t) {
    t.plan(13)
    var errors = [{culprit: 1}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.deepEqual(body.errors, errors)
        t.end()
      })
  })

  t.test('successful request', function (t) {
    t.plan(13)
    var errors = [{context: {custom: {foo: 'bar'}}}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.deepEqual(body.errors, errors)
        t.end()
      })
  })

  t.test('bad request', function (t) {
    t.plan(2)

    var server = http.createServer(function (req, res) {
      t.ok(true, 'should make request')
      res.statusCode = 500
      res.end()
    })

    server.listen(function () {
      var agent = Agent()
      agent.start({
        appName: 'foo',
        serverUrl: 'http://localhost:' + server.address().port
      })
      var errors = [{context: {custom: {foo: 'bar'}}}]
      request.errors(agent, errors, function () {
        server.close()
        t.ok(true, 'should call callback')
        t.end()
      })
    })
  })

  t.test('should use filters if provided', function (t) {
    t.plan(5)
    var errors = [{context: {custom: {order: 0}}}]
    APMServer()
      .on('listening', function () {
        this.agent.addFilter(function (data) {
          var error = data.errors[0]
          t.equal(++error.context.custom.order, 1)
          return data
        })
        this.agent.addFilter(function (data) {
          var error = data.errors[0]
          t.equal(++error.context.custom.order, 2)
          return {errors: [{owned: true}]}
        })
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.deepEqual(body, {errors: [{owned: true}]})
        t.end()
      })
  })

  t.test('should abort if any filter returns falsy', function (t) {
    t.plan(1)
    var errors = [{exception: {message: 'foo'}}]
    var server
    APMServer()
      .on('server', function (_server) {
        server = _server
      })
      .on('listening', function () {
        this.agent.addFilter(function () {})
        this.agent.addFilter(function () {
          t.fail('should not 2nd filter')
        })
        request.errors(this.agent, errors, function () {
          server.close()
          t.ok(true, 'should call callback')
          t.end()
        })
      })
      .on('request', function () {
        t.fail('should not send error to intake')
      })
  })

  t.test('should anonymize the http Authorization header by default', function (t) {
    t.plan(14)
    var errors = [{context: {request: {headers: {authorization: 'secret'}}}}]
    APMServer()
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].context.request.headers.authorization, '[REDACTED]')
        t.end()
      })
  })

  t.test('should not anonymize the http Authorization header if disabled', function (t) {
    t.plan(14)
    var errors = [{context: {request: {headers: {authorization: 'secret'}}}}]
    APMServer({filterHttpHeaders: false})
      .on('listening', function () {
        request.errors(this.agent, errors)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].context.request.headers.authorization, 'secret')
        t.end()
      })
  })
})

test('#transactions()', function (t) {
  t.plan(13)
  var transactions = [{spans: []}]
  APMServer()
    .on('listening', function () {
      request.transactions(this.agent, transactions)
    })
    .on('request', validateTransactionsRequest(t))
    .on('body', function (body) {
      assertRoot(t, body)
      t.deepEqual(body.transactions, transactions)
      t.end()
    })
})

function assertRoot (t, payload) {
  t.equal(payload.app.name, 'some-app-name')
  t.equal(payload.app.pid, process.pid)
  t.ok(payload.app.pid > 0)
  t.ok(payload.app.process_title)
  t.ok(/(\/usr\/local\/bin\/)?node/.test(payload.app.process_title))
  t.deepEqual(payload.app.argv, process.argv)
  t.ok(payload.app.argv.length >= 2)
  t.deepEqual(payload.app.runtime, {name: 'node', version: process.version})
  t.deepEqual(payload.app.agent, {name: 'nodejs', version: agentVersion})
  t.deepEqual(payload.system, {
    hostname: os.hostname(),
    architecture: process.arch,
    platform: process.platform
  })
}

function validateErrorRequest (t) {
  return function (req) {
    t.equal(req.method, 'POST', 'should be a POST request')
    t.equal(req.url, '/v1/errors', 'should be sent to the errors endpoint')
  }
}

function validateTransactionsRequest (t) {
  return function (req) {
    t.equal(req.method, 'POST', 'should be a POST request')
    t.equal(req.url, '/v1/transactions', 'should be sent to the transactions endpoint')
  }
}
