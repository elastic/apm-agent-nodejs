'use strict'

var http = require('http')
var path = require('path')
var os = require('os')

var test = require('tape')
var isError = require('core-util-is').isError

var Agent = require('./_agent')
var APMServer = require('./_apm_server')
var assert = require('./_assert')
var config = require('../lib/config')

var agentVersion = require('../package.json').version

test('#startTransaction()', function (t) {
  var agent = Agent()
  agent.start()
  var trans = agent.startTransaction('foo', 'bar')
  t.equal(trans.name, 'foo')
  t.equal(trans.type, 'bar')
  t.end()
})

test('#endTransaction()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    agent.endTransaction()
    t.end()
  })

  t.test('with no result', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(trans.ended, false)
    agent.endTransaction()
    t.equal(trans.ended, true)
    t.equal(trans.result, 'success')
    t.end()
  })

  t.test('with explicit result', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(trans.ended, false)
    agent.endTransaction('done')
    t.equal(trans.ended, true)
    t.equal(trans.result, 'done')
    t.end()
  })
})

test('#currentTransaction', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.notOk(agent.currentTransaction)
    t.end()
  })

  t.test('with active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.currentTransaction, trans)
    agent.endTransaction()
    t.end()
  })
})

test('#setTransactionName', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.doesNotThrow(function () {
      agent.setTransactionName('foo')
    })
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    agent.setTransactionName('foo')
    t.equal(trans.name, 'foo')
    t.end()
  })
})

test('#startSpan()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.startSpan(), null)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var span = agent.startSpan('span-name', 'span-type')
    t.ok(span, 'should return a span')
    t.equal(span.name, 'span-name')
    t.equal(span.type, 'span-type')
    t.end()
  })
})

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

test('#addTags', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.addTags({foo: 1}), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.addTags({foo: 1, bar: 2}), true)
    t.equal(agent.addTags({foo: 3}), true)
    t.deepEqual(trans._tags, {foo: '3', bar: '2'})
    t.end()
  })
})

test('#addFilter() - invalid argument', function (t) {
  t.plan(5)
  APMServer()
    .on('listening', function () {
      this.agent.addFilter(function (data) {
        var error = data.errors[0]
        t.equal(++error.context.custom.order, 1)
        return data
      })
      this.agent.addFilter('invalid')
      this.agent.addFilter(function (data) {
        var error = data.errors[0]
        t.equal(++error.context.custom.order, 2)
        return data
      })
      this.agent.captureError(new Error('foo'), {custom: {order: 0}})
    })
    .on('request', validateErrorRequest(t))
    .on('body', function (body) {
      t.deepEqual(body.errors[0].context.custom.order, 2)
      t.end()
    })
})

test('#flush()', function (t) {
  t.test('start not called', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if agent.start() wasn\'t called')
    })
  })

  t.test('start called, but agent inactive', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.start({active: false})
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if agent is inactive')
    })
  })

  t.test('agent started, but no data in the queue', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.start()
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if there\'s nothing to flush')
    })
  })

  t.test('agent started, but no data in the queue', function (t) {
    t.plan(5)
    APMServer()
      .on('listening', function () {
        this.agent.startTransaction('foo')
        this.agent.endTransaction()
        this.agent.flush(function (err) {
          t.error(err)
          t.pass('should call flush callback after flushing the queue')
          t.end()
        })
      })
      .on('request', validateTransactionsRequest(t))
      .on('body', function (body) {
        t.deepEqual(body.transactions[0].name, 'foo')
      })
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

  t.test('should not fail on a non string err.message', function (t) {
    t.plan(4)
    APMServer()
      .on('listening', function () {
        var err = new Error()
        err.message = {foo: 'bar'}
        this.agent.captureError(err)
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, '[object Object]')
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
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, 'foo')
        t.notOk('log' in body.errors[0], 'should not have a log')
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - off (string)', function (t) {
    t.plan(6)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'foo')
        t.notOk('stacktrace' in body.errors[0].log, 'should not have a log.stacktrace')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - off (param msg)', function (t) {
    t.plan(6)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'Hello World')
        t.notOk('stacktrace' in body.errors[0].log, 'should not have a log.stacktrace')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (error)', function (t) {
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].exception.message, 'foo')
        t.notOk('log' in body.errors[0], 'should not have a log')
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (string)', function (t) {
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'foo')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (param msg)', function (t) {
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'Hello World')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (error)', function (t) {
    t.plan(13)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS})
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'foo')
        t.equal(body.errors[0].exception.message, 'foo')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        assertStackTrace(t, body.errors[0].exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (string)', function (t) {
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS})
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'foo')
        t.notOk('exception' in body.errors[0], 'should not have an exception')
        assertStackTrace(t, body.errors[0].log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (param msg)', function (t) {
    t.plan(9)
    APMServer({captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS})
      .on('listening', function () {
        this.agent.captureError({message: 'Hello %s', params: ['World']})
      })
      .on('request', validateErrorRequest(t))
      .on('body', function (body) {
        t.equal(body.errors.length, 1)
        t.equal(body.errors[0].log.message, 'Hello World')
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
      serviceName: 'some-service-name',
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
      serviceName: 'some-service-name',
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

test('#lambda()', function (t) {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs8.10'
  process.env.AWS_REGION = 'us-east-1'
  var baseContext = {
    functionVersion: '1.2.3',
    invokedFunctionArn: 'invokedFunctionArn',
    memoryLimitInMB: 'memoryLimitInMB',
    awsRequestId: 'awsRequestId',
    logGroupName: 'logGroupName',
    logStreamName: 'logStreamName'
  }
  class Lambda {
    constructor () {
      this.methods = {}
    }

    register (name, fn) {
      this.methods[name] = fn
    }

    invoke (method, payload, callback) {
      var fn = this.methods[method]
      if (!fn) throw new Error(`no lambda function "${method}"`)
      var context = {
        functionName: method,
        done: callback,
        succeed (result) { callback(null, result) },
        fail (error) { callback(error) }
      }
      fn(payload, Object.assign(context, baseContext), callback)
    }
  }

  function assertContext (t, name, data) {
    t.ok(data)
    const lambda = data.lambda
    t.ok(lambda)
    t.equal(lambda.functionName, name)
    var keys = Object.keys(baseContext)
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      t.equal(lambda[key], baseContext[key])
    }
    t.equal(lambda.executionEnv, process.env.AWS_EXECUTION_ENV)
    t.equal(lambda.region, process.env.AWS_REGION)
  }

  t.test('success - basic callback', function (t) {
    var name = 'greet.hello'
    var input = { name: 'world' }
    var output = 'Hello, world!'

    APMServer()
      .on('listening', function () {
        var fn = this.agent.lambda((payload, context, callback) => {
          callback(null, `Hello, ${payload.name}!`)
        })
        var lambda = new Lambda()
        lambda.register(name, fn)
        lambda.invoke(name, input, (err, result) => {
          t.error(err)
          t.equal(result, output)
          this.server.close()
          t.end()
        })
      })
      .on('request', validateTransactionsRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        assertTransactions(t, body, name, input, output)
        assertContext(t, name, body.transactions[0].context.custom)
      })
  })

  t.test('success - context.succeed', function (t) {
    var name = 'greet.hello'
    var input = { name: 'world' }
    var output = 'Hello, world!'

    APMServer()
      .on('listening', function () {
        var fn = this.agent.lambda((payload, context, callback) => {
          context.succeed(`Hello, ${payload.name}!`)
        })
        var lambda = new Lambda()
        lambda.register(name, fn)
        lambda.invoke(name, input, (err, result) => {
          t.error(err)
          t.equal(result, output)
          this.server.close()
          t.end()
        })
      })
      .on('request', validateTransactionsRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        assertTransactions(t, body, name, input, output)
        assertContext(t, name, body.transactions[0].context.custom)
      })
  })

  t.test('success - context.done', function (t) {
    var name = 'greet.hello'
    var input = { name: 'world' }
    var output = 'Hello, world!'

    APMServer()
      .on('listening', function () {
        var fn = this.agent.lambda((payload, context, callback) => {
          context.done(null, `Hello, ${payload.name}!`)
        })
        var lambda = new Lambda()
        lambda.register(name, fn)
        lambda.invoke(name, input, (err, result) => {
          t.error(err)
          t.equal(result, output)
          this.server.close()
          t.end()
        })
      })
      .on('request', validateTransactionsRequest(t))
      .on('body', function (body) {
        assertRoot(t, body)
        assertTransactions(t, body, name, input, output)
        assertContext(t, name, body.transactions[0].context.custom)
      })
  })

  t.test('fail - basic callback', function (t) {
    var name = 'fn.fail'
    var input = {}
    var output
    var error = new Error('fail')

    var requests = 0
    var bodies = 0

    APMServer({
      sourceContextErrorLibraryFrames: 0
    }, {
      skipClose: true
    })
      .on('listening', function () {
        var fn = this.agent.lambda((payload, context, callback) => {
          callback(error)
        })
        var lambda = new Lambda()
        lambda.register(name, fn)
        lambda.invoke(name, input, (err, result) => {
          t.ok(err)
          t.notOk(result)
          t.equal(requests, 2, 'should have gotten two requests')
          t.equal(bodies, 2, 'should have gotten two bodies')
          this.server.close()
          t.end()
        })
      })
      .on('request', function (req) {
        var fn = ++requests === 1
          ? validateErrorRequest(t)
          : validateTransactionsRequest(t)
        fn(req)
      })
      .on('body', function (body) {
        assertRoot(t, body)
        if (++bodies === 1) {
          assertErrors(t, body, name, input, error)
        } else {
          assertTransactions(t, body, name, input, output)
          assertContext(t, name, body.transactions[0].context.custom)
        }
      })
  })

  t.test('fail - context.fail', function (t) {
    var name = 'fn.fail'
    var input = {}
    var output
    var error = new Error('fail')

    var requests = 0
    var bodies = 0

    APMServer({
      sourceContextErrorLibraryFrames: 0
    }, {
      skipClose: true
    })
      .on('listening', function () {
        var fn = this.agent.lambda((payload, context, callback) => {
          context.fail(error)
        })
        var lambda = new Lambda()
        lambda.register(name, fn)
        lambda.invoke(name, input, (err, result) => {
          t.ok(err)
          t.notOk(result)
          t.equal(requests, 2, 'should have gotten two requests')
          t.equal(bodies, 2, 'should have gotten two bodies')
          this.server.close()
          t.end()
        })
      })
      .on('request', function (req) {
        var fn = ++requests === 1
          ? validateErrorRequest(t)
          : validateTransactionsRequest(t)
        fn(req)
      })
      .on('body', function (body) {
        assertRoot(t, body)
        if (++bodies === 1) {
          assertErrors(t, body, name, input, error, this.agent)
        } else {
          assertTransactions(t, body, name, input, output)
          assertContext(t, name, body.transactions[0].context.custom)
        }
      })
  })
})

function assertRoot (t, payload) {
  t.equal(payload.service.name, 'some-service-name')
  t.deepEqual(payload.service.runtime, {name: 'node', version: process.version})
  t.deepEqual(payload.service.agent, {name: 'nodejs', version: agentVersion})
  t.deepEqual(payload.system, {
    hostname: os.hostname(),
    architecture: process.arch,
    platform: process.platform
  })

  t.ok(payload.process)
  t.equal(payload.process.pid, process.pid)
  t.ok(payload.process.pid > 0, 'should have a pid greater than 0')
  t.ok(payload.process.title, 'should have a process title')
  t.ok(
    /(npm|node)/.test(payload.process.title),
    `process.title should contain expected value (was: "${payload.process.title}")`
  )
  t.deepEqual(payload.process.argv, process.argv)
  t.ok(payload.process.argv.length >= 2, 'should have at least two process arguments')
}

function assertTransactions (t, payload, name, input, output) {
  t.equal(payload.transactions.length, 1)
  var trans = payload.transactions[0]
  t.equal(trans.name, name)
  t.equal(trans.type, 'lambda')
  t.equal(trans.result, 'success')
  t.ok(trans.context)
  var custom = trans.context.custom
  t.ok(custom)
  var lambda = custom.lambda
  t.ok(lambda)
  t.deepEqual(lambda.input, input)
  t.equal(lambda.output, output)
}

function assertErrors (t, payload, name, input, expectedError, agent) {
  t.equal(payload.errors.length, 1)
  var exception = payload.errors[0].exception
  t.ok(exception)
  t.equal(exception.message, expectedError.message)
  t.equal(exception.type, 'Error')
  assert.stacktrace(t, 'Test.<anonymous>', __filename, exception.stacktrace, agent, true)
}

function assertStackTrace (t, stacktrace) {
  t.ok(stacktrace !== undefined, 'should have a stack trace')
  t.ok(Array.isArray(stacktrace), 'stack trace should be an array')
  t.ok(stacktrace.length > 0, 'stack trace should have at least one frame')
  t.equal(stacktrace[0].filename, path.join('test', 'agent.js'))
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

function deep (depth, n) {
  if (!n) n = 0
  if (n < depth) return deep(depth, ++n)
  return new Error()
}
