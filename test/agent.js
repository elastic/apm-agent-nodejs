'use strict'

var http = require('http')
var test = require('tape')
var isError = require('core-util-is').isError
var Agent = require('./_agent')
var APMServer = require('./_apm_server')

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
    t.plan(5)
    APMServer()
      .on('listening', function () {
        this.agent.captureError(new Error('with callback'), function () {
          t.ok(true, 'called callback')
          t.end()
        })
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, 'with callback')
      })
  })

  t.test('without callback', function (t) {
    t.plan(4)
    APMServer()
      .on('listening', function () {
        this.agent.captureError(new Error('without callback'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, 'without callback')
        t.end()
      })
  })

  t.test('should send a plain text message to the server', function (t) {
    t.plan(4)
    APMServer()
      .on('listening', function () {
        this.agent.captureError('Hey!')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'Hey!')
        t.end()
      })
  })

  t.test('should use `param_message` as well as `message` if given an object as 1st argument', function (t) {
    t.plan(5)
    APMServer()
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'Hello World')
        t.equal(body.errors[0].log.param_message, 'Hello %s')
        t.end()
      })
  })

  t.test('should adhere to default stackTraceLimit', function (t) {
    t.plan(5)
    APMServer()
      .on('listening', function () {
        this.agent.captureError(deep(256))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.stacktrace.length, 50)
        t.equal(body.errors[0].exception.stacktrace[0].context_line.trim(), 'return new Error()')
        t.end()
      })
  })

  t.test('should adhere to custom stackTraceLimit', function (t) {
    t.plan(5)
    APMServer({stackTraceLimit: 5})
      .on('listening', function () {
        this.agent.captureError(deep(42))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.stacktrace.length, 5)
        t.equal(body.errors[0].exception.stacktrace[0].context_line.trim(), 'return new Error()')
        t.end()
      })
  })

  t.test('should merge context', function (t) {
    t.plan(7)
    APMServer()
      .on('listening', function () {
        var agent = this.agent
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
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        var context = body.errors[0].context
        t.deepEqual(context.user, {a: 1, b: 1, merge: {shallow: true}})
        t.deepEqual(context.custom, {a: 3, b: 2, merge: {shallow: true}})
        t.end()
      })
  })

  t.test('capture location stack trace - off (error)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 0})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('log' in body.errors[0], 'should not have a log')
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - off (string)', function (t) {
    t.plan(5)
    APMServer({captureLocationStackTraces: 0})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('stacktrace' in body.errors[0].log, 'should not have a log.stacktrace')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - off (param msg)', function (t) {
    t.plan(5)
    APMServer({captureLocationStackTraces: 0})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('stacktrace' in body.errors[0].log, 'should not have a log.stacktrace')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (error)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 1})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('log' in body.errors[0], 'should not have a log')
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (string)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 1})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (param msg)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 1})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (error)', function (t) {
    t.plan(11)
    APMServer({captureLocationStackTraces: 2})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        assertStackTrace(t, body.errors[0].log.stacktrace)
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (string)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 2})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (param msg)', function (t) {
    t.plan(8)
    APMServer({captureLocationStackTraces: 2})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })
})

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    var agent = Agent()
    t.equal(process._events.uncaughtException, undefined)
    agent.start({
      appName: 'some-app-name',
      captureExceptions: false,
      logLevel: 'error'
    })
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, 1)
    t.end()
  })

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    var agent = Agent()
    agent.start({
      appName: 'some-app-name',
      captureExceptions: false,
      logLevel: 'error'
    })
    agent.handleUncaughtExceptions()
    var before = process._events.uncaughtException.length
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, before)
    t.end()
  })

  t.test('should send an uncaughtException to server', function (t) {
    t.plan(5)
    APMServer()
      .on('listening', function () {
        this.agent.handleUncaughtExceptions(function (err) {
          t.ok(isError(err))
          t.end()
        })
        process.emit('uncaughtException', new Error('uncaught'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, 'uncaught')
      })
  })
})

function assertStackTrace (t, stacktrace) {
  t.ok(stacktrace !== undefined, 'should have a stack trace')
  t.ok(Array.isArray(stacktrace), 'stack trace should be an array')
  t.ok(stacktrace.length > 0, 'stack trace should have at least one frame')
  t.equal(stacktrace[0].filename, 'test/agent.js')
}

function validateErrorRequest (t) {
  return function (req) {
    t.equal(req.method, 'POST', 'should be a POST request')
    t.equal(req.url, '/v1/errors', 'should be sent to the errors endpoint')
  }
}

function deep (depth, n) {
  if (!n) n = 0
  if (n < depth) return deep(depth, ++n)
  return new Error()
}
