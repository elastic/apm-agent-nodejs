'use strict'

var http = require('http')
var zlib = require('zlib')
var test = require('tape')
var nock = require('nock')
var getPort = require('get-port')
var isError = require('core-util-is').isError
var Agent = require('./_agent')
var request = require('../lib/request')

var opts = {
  serviceName: 'some-service-name',
  secretToken: 'secret',
  captureExceptions: false,
  logLevel: 'error'
}

var skipBody = function () { return '*' }

test('#setUserContext()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.setUserContext({foo: 1}), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setUserContext({foo: 1}), true)
    t.deepEqual(trans._user, {foo: 1})
    t.end()
  })
})

test('#setCustomContext()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.setCustomContext({foo: 1}), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setCustomContext({foo: 1}), true)
    t.deepEqual(trans._custom, {foo: 1})
    t.end()
  })
})

test('#setTag()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.setTag('foo', 1), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setTag('foo', 1), true)
    t.deepEqual(trans._tags, {foo: '1'})
    t.end()
  })
})

test('#captureError()', function (t) {
  t.test('with callback', function (t) {
    var agent = Agent()
    agent.start(opts)
    var scope = nock('http://localhost:8200')
      .filteringRequestBody(skipBody)
      .post('/v1/errors', '*')
      .reply(200)

    agent.captureError(new Error(), function () {
      scope.done()
      t.end()
    })
  })

  t.test('without callback', function (t) {
    var agent = Agent()
    agent.start(opts)
    var scope = nock('http://localhost:8200')
      .filteringRequestBody(skipBody)
      .post('/v1/errors', '*')
      .reply(200)

    agent.captureError(new Error())

    setTimeout(function () {
      scope.done()
      t.end()
    }, 50)
  })

  t.test('should send a plain text message to the server', function (t) {
    var agent = Agent()
    agent.start(opts)
    var scope = nock('http://localhost:8200')
      .filteringRequestBody(skipBody)
      .post('/v1/errors', '*')
      .reply(200)

    agent.captureError('Hey!', function () {
      scope.done()
      t.end()
    })
  })

  t.test('should use `param_message` as well as `message` if given an object as 1st argument', function (t) {
    var agent = Agent()
    agent.start(opts)
    var oldErrorsFn = request.errors
    request.errors = function (agent, errors, cb) {
      var error = errors[0]
      t.equal(error.log.message, 'Hello World')
      t.equal(error.log.param_message, 'Hello %s')
      request.errors = oldErrorsFn
      t.end()
    }
    agent.captureError({ message: 'Hello %s', params: ['World'] })
  })

  t.test('should send an Error to server', function (t) {
    var agent = Agent()
    agent.start(opts)
    var scope = nock('http://localhost:8200')
      .filteringRequestBody(skipBody)
      .post('/v1/errors', '*')
      .reply(200)

    agent.captureError(new Error('wtf?'), function () {
      scope.done()
      t.end()
    })
  })

  t.test('should adhere to default stackTraceLimit', function (t) {
    getPort().then(function (port) {
      var agent = Agent()
      agent.start(Object.assign(
        {serverUrl: 'http://localhost:' + port},
        opts
      ))

      var server = http.createServer(function (req, res) {
        var buffers = []
        var gunzip = zlib.createGunzip()
        var unzipped = req.pipe(gunzip)

        unzipped.on('data', buffers.push.bind(buffers))
        unzipped.on('end', function () {
          res.end()
          server.close()
          var data = JSON.parse(Buffer.concat(buffers))
          t.equal(data.errors.length, 1)
          t.equal(data.errors[0].exception.stacktrace.length, 50)
          t.equal(data.errors[0].exception.stacktrace[0].context_line.trim(), 'return new Error()')
          t.end()
        })
      })

      server.listen(port, function () {
        agent.captureError(deep(256))
      })

      function deep (depth, n) {
        if (!n) n = 0
        if (n < depth) return deep(depth, ++n)
        return new Error()
      }
    })
  })

  t.test('should adhere to custom stackTraceLimit', function (t) {
    getPort().then(function (port) {
      var agent = Agent()
      agent.start(Object.assign(
        {stackTraceLimit: 5, serverUrl: 'http://localhost:' + port},
        opts
      ))

      var server = http.createServer(function (req, res) {
        var buffers = []
        var gunzip = zlib.createGunzip()
        var unzipped = req.pipe(gunzip)

        unzipped.on('data', buffers.push.bind(buffers))
        unzipped.on('end', function () {
          res.end()
          server.close()
          var data = JSON.parse(Buffer.concat(buffers))
          t.equal(data.errors.length, 1)
          t.equal(data.errors[0].exception.stacktrace.length, 5)
          t.equal(data.errors[0].exception.stacktrace[0].context_line.trim(), 'return new Error()')
          t.end()
        })
      })

      server.listen(port, function () {
        agent.captureError(deep(42))
      })

      function deep (depth, n) {
        if (!n) n = 0
        if (n < depth) return deep(depth, ++n)
        return new Error()
      }
    })
  })

  t.test('should merge context', function (t) {
    var agent = Agent()
    agent.start({
      serviceName: 'foo',
      secretToken: 'baz',
      filterHttpHeaders: false,
      logLevel: 'error'
    })

    var oldErrorsFn = request.errors
    request.errors = function (agent, errors, cb) {
      var context = errors[0].context
      t.deepEqual(context.user, {a: 1, b: 1, merge: {shallow: true}})
      t.deepEqual(context.custom, {a: 3, b: 2, merge: {shallow: true}})
      request.errors = oldErrorsFn
      t.end()
    }

    var server = http.createServer(function (req, res) {
      agent.startTransaction()
      t.equal(agent.setUserContext({a: 1, merge: {a: 2}}), true)
      t.equal(agent.setCustomContext({a: 3, merge: {a: 4}}), true)
      agent.captureError(new Error('foo'), {user: {b: 1, merge: {shallow: true}}, custom: {b: 2, merge: {shallow: true}}})
      res.end()
    })

    server.listen(function () {
      http.request({
        port: server.address().port
      }, function (res) {
        res.resume()
        res.on('end', function () {
          server.close()
        })
      }).end()
    })
  })
})

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    var agent = Agent()
    t.equal(process._events.uncaughtException, undefined)
    agent.start(opts)
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, 1)
    t.end()
  })

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    var agent = Agent()
    agent.start(opts)
    agent.handleUncaughtExceptions()
    var before = process._events.uncaughtException.length
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, before)
    t.end()
  })

  t.test('should send an uncaughtException to server', function (t) {
    var agent = Agent()

    var scope = nock('http://localhost:8200')
      .filteringRequestBody(skipBody)
      .post('/v1/errors', '*')
      .reply(200)

    agent.start(opts)
    agent.handleUncaughtExceptions(function (err) {
      t.ok(isError(err))
      scope.done()
      t.end()
    })

    process.emit('uncaughtException', new Error('derp'))
  })
})
