'use strict'

var os = require('os')
var zlib = require('zlib')
var test = require('tape')
var nock = require('nock')
var objectAssign = require('object-assign')
var Agent = require('../lib/agent')
var request = require('../lib/request')

var agentVersion = require('../package.json').version

var opts = {
  appName: 'some-app-name',
  secretToken: 'secret',
  appVersion: 'my-app-version',
  captureExceptions: false,
  logLevel: 'error'
}

test('#errors()', function (t) {
  t.test('envelope', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)
    agent._httpClient.request = function (endpoint, headers, data, cb) {
      t.equal(endpoint, 'errors')
      t.equal(data.errors.length, 1)
      assertRoot(t, data)
      t.end()
    }
    request.errors(agent, [{}])
  })

  t.test('non-string log.message', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)
    agent._httpClient.request = function () {
      t.end()
    }
    request.errors(agent, [{log: {message: 1}}])
  })

  t.test('non-string exception.message', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)
    agent._httpClient.request = function () {
      t.end()
    }
    request.errors(agent, [{exception: {message: 1}}])
  })

  t.test('non-string culprit', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)
    agent._httpClient.request = function () {
      t.end()
    }
    request.errors(agent, [{culprit: 1}])
  })

  t.test('successful request', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)

    var errors = [{context: {custom: {foo: 'bar'}}}]
    var payload = request._envelope(agent)
    payload.errors = errors
    var body = JSON.stringify(payload)

    zlib.gzip(body, function (err, buffer) {
      t.error(err)
      var scope = nock('http://localhost:8200')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'))
          return 'ok'
        })
        .post('/v1/errors', 'ok')
        .reply(200)
      request.errors(agent, errors, function () {
        scope.done()
        t.end()
      })
    })
  })

  t.test('bad request', function (t) {
    var errors = [{context: {custom: {foo: 'bar'}}}]
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)
    var scope = nock('http://localhost:8200')
      .filteringRequestBody(function () { return '*' })
      .post('/v1/errors', '*')
      .reply(500)
    request.errors(agent, errors, function () {
      scope.done()
      t.end()
    })
  })

  t.test('should use filters if provided', function (t) {
    t.plan(3)
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.addFilter(function (data) {
      var error = data.errors[0]
      t.equal(++error.context.custom.order, 1)
      return data
    })
    agent.addFilter(function (data) {
      var error = data.errors[0]
      t.equal(++error.context.custom.order, 2)
      return {errors: [{owned: true}]}
    })
    agent.start(opts)
    agent._httpClient.request = function (endpoint, headers, data, cb) {
      t.deepEqual(data, {errors: [{owned: true}]})
      t.end()
    }
    var errors = [{context: {custom: {order: 0}}}]
    request.errors(agent, errors)
  })

  t.test('should abort if any filter returns falsy', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.addFilter(function () {})
    agent.addFilter(function () {
      t.fail('should not 2nd filter')
    })
    agent.start(opts)
    agent._httpClient.request = function () {
      t.fail('should not send error to intake')
    }
    var errors = [{exception: {message: 'foo'}}]
    request.errors(agent, errors, function () {
      t.end()
    })
  })

  t.test('should anonymize the http Authorization header by default', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(opts)

    agent._httpClient.request = function (endpoint, headers, data, cb) {
      t.equal(data.errors.length, 1)
      t.equal(data.errors[0].context.request.headers.authorization, '[REDACTED]')
      t.end()
    }

    var errors = [{context: {request: {headers: {authorization: 'secret'}}}}]
    request.errors(agent, errors)
  })

  t.test('should not anonymize the http Authorization header if disabled', function (t) {
    global._elastic_apm_initialized = null
    var agent = new Agent()
    agent.start(objectAssign({filterHttpHeaders: false}, opts))

    agent._httpClient.request = function (endpoint, headers, data, cb) {
      t.equal(data.errors.length, 1)
      t.equal(data.errors[0].context.request.headers.authorization, 'secret')
      t.end()
    }

    var errors = [{context: {request: {headers: {authorization: 'secret'}}}}]
    request.errors(agent, errors)
  })
})

test('#transactions()', function (t) {
  global._elastic_apm_initialized = null
  var agent = new Agent()
  agent.start(opts)
  agent._httpClient.request = function (endpoint, headers, data, cb) {
    t.equal(endpoint, 'transactions')
    assertRoot(t, data)
    t.equal(data.transactions.length, 1)
    t.end()
  }
  request.transactions(agent, [{traces: []}])
})

function assertRoot (t, payload) {
  t.equal(payload.app.name, 'some-app-name')
  t.equal(payload.app.pid, process.pid)
  t.ok(payload.app.pid > 0)
  t.equal(payload.app.process_title, 'node')
  t.deepEqual(payload.app.argv, process.argv)
  t.ok(payload.app.argv.length >= 2)
  t.deepEqual(payload.app.runtime, {name: 'node', version: process.version})
  t.deepEqual(payload.app.agent, {name: 'nodejs', version: agentVersion})
  t.equal(payload.app.version, 'my-app-version')
  t.deepEqual(payload.system, {
    hostname: os.hostname(),
    architecture: process.arch,
    platform: process.platform
  })
}
