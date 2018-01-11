'use strict'

var os = require('os')
var util = require('util')
var http = require('http')
var zlib = require('zlib')
var test = require('tape')
var nock = require('nock')
var getPort = require('get-port')
var isRegExp = require('core-util-is').isRegExp
var isError = require('core-util-is').isError
var request = require('../lib/request')
var Agent = require('../lib/agent')

var opts = {
  appName: 'some-app-name',
  secretToken: 'secret',
  captureExceptions: false,
  logLevel: 'error'
}

var optionFixtures = [
  ['appName', 'APP_NAME'],
  ['secretToken', 'SECRET_TOKEN'],
  ['appVersion', 'APP_VERSION'],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME', os.hostname()],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', 50],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['instrument', 'INSTRUMENT', true],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['ff_captureFrame', 'FF_CAPTURE_FRAME', false]
]

var falsyValues = [false, 0, '', '0', 'false', 'no', 'off', 'disabled']
var truthyValues = [true, 1, '1', 'true', 'yes', 'on', 'enabled']

var skipBody = function () { return '*' }
var uncaughtExceptionListeners = process._events.uncaughtException
var agent

var setup = function () {
  clean()
  uncaughtExceptionListeners = process._events.uncaughtException
  process.removeAllListeners('uncaughtException')
  agent = new Agent()
}

var clean = function () {
  global._elastic_apm_initialized = null
  process._events.uncaughtException = uncaughtExceptionListeners
  if (agent) agent._filters = []
}

optionFixtures.forEach(function (fixture) {
  if (fixture[1]) {
    test('should be configurable by envrionment variable ELASTIC_APM_' + fixture[1], function (t) {
      setup()
      var bool = typeof fixture[2] === 'boolean'
      var value = bool ? (fixture[2] ? '0' : '1') : 'custom-value'
      process.env['ELASTIC_APM_' + fixture[1]] = value
      agent.start()
      t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value)
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })

    test('should overwrite ELASTIC_APM_' + fixture[1] + ' by option property ' + fixture[0], function (t) {
      setup()
      var opts = {}
      var bool = typeof fixture[2] === 'boolean'
      var value1 = bool ? (fixture[2] ? '0' : '1') : 'overwriting-value'
      var value2 = bool ? (fixture[2] ? '1' : '0') : 'custom-value'
      opts[fixture[0]] = value1
      process.env['ELASTIC_APM_' + fixture[1]] = value2
      agent.start(opts)
      t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value1)
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })
  }

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    setup()
    agent.start()
    t.equal(agent._conf[fixture[0]], fixture[2])
    t.end()
  })
})

falsyValues.forEach(function (val) {
  test('should be disabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    setup()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ appName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, false)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

truthyValues.forEach(function (val) {
  test('should be enabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    setup()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ appName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, true)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

test('should overwrite ELASTIC_APM_ACTIVE by option property active', function (t) {
  setup()
  var opts = { appName: 'foo', secretToken: 'baz', active: false }
  process.env.ELASTIC_APM_ACTIVE = '1'
  agent.start(opts)
  t.equal(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  t.end()
})

test('should default active to true if required options have been specified', function (t) {
  setup()
  agent.start({ appName: 'foo', secretToken: 'baz' })
  t.equal(agent._conf.active, true)
  t.end()
})

test('should default active to false if required options have not been specified', function (t) {
  setup()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('should force active to false if required options have not been specified', function (t) {
  setup()
  agent.start({ active: true })
  t.equal(agent._conf.active, false)
  t.end()
})

test('should default to empty request blacklist arrays', function (t) {
  setup()
  agent.start()
  t.equal(agent._conf.ignoreUrlStr.length, 0)
  t.equal(agent._conf.ignoreUrlRegExp.length, 0)
  t.equal(agent._conf.ignoreUserAgentStr.length, 0)
  t.equal(agent._conf.ignoreUserAgentRegExp.length, 0)
  t.end()
})

test('should separate strings and regexes into their own blacklist arrays', function (t) {
  setup()
  agent.start({
    ignoreUrls: ['str1', /regex1/],
    ignoreUserAgents: ['str2', /regex2/]
  })

  t.deepEqual(agent._conf.ignoreUrlStr, ['str1'])
  t.deepEqual(agent._conf.ignoreUserAgentStr, ['str2'])

  t.equal(agent._conf.ignoreUrlRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUrlRegExp[0]))
  t.equal(agent._conf.ignoreUrlRegExp[0].toString(), '/regex1/')

  t.equal(agent._conf.ignoreUserAgentRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUserAgentRegExp[0]))
  t.equal(agent._conf.ignoreUserAgentRegExp[0].toString(), '/regex2/')

  t.end()
})

test('missing appName => inactive', function (t) {
  setup()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('invalid appName => inactive', function (t) {
  setup()
  agent.start({appName: 'foo&bar'})
  t.equal(agent._conf.active, false)
  t.end()
})

test('valid appName => active', function (t) {
  setup()
  agent.start({appName: 'fooBAR0123456789_- '})
  t.equal(agent._conf.active, true)
  t.end()
})

test('#setUserContext()', function (t) {
  t.test('no active transaction', function (t) {
    setup()
    agent.start()
    t.equal(agent.setUserContext({foo: 1}), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    setup()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setUserContext({foo: 1}), true)
    t.deepEqual(trans._user, {foo: 1})
    t.end()
  })
})

test('#setCustomContext()', function (t) {
  t.test('no active transaction', function (t) {
    setup()
    agent.start()
    t.equal(agent.setCustomContext({foo: 1}), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    setup()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setCustomContext({foo: 1}), true)
    t.deepEqual(trans._custom, {foo: 1})
    t.end()
  })
})

test('#setTag()', function (t) {
  t.test('no active transaction', function (t) {
    setup()
    agent.start()
    t.equal(agent.setTag('foo', 1), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    setup()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setTag('foo', 1), true)
    t.deepEqual(trans._tags, {foo: '1'})
    t.end()
  })
})

test('#captureError()', function (t) {
  t.test('with callback', function (t) {
    setup()
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
    setup()
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
    setup()
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
    setup()
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
    setup()
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
      setup()
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
      setup()
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
    setup()
    agent.start({
      appName: 'foo',
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
    setup()
    t.equal(process._events.uncaughtException, undefined)
    agent.start(opts)
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, 1)
    t.end()
  })

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    setup()
    agent.start(opts)
    agent.handleUncaughtExceptions()
    var before = process._events.uncaughtException.length
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, before)
    t.end()
  })

  t.test('should send an uncaughtException to server', function (t) {
    setup()

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
