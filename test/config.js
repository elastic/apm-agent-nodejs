'use strict'

var IncomingMessage = require('http').IncomingMessage
var util = require('util')

var semver = require('semver')
var test = require('tape')
var isRegExp = require('core-util-is').isRegExp

var Agent = require('./_agent')
var config = require('../lib/config')
var Instrumentation = require('../lib/instrumentation')

var optionFixtures = [
  ['serviceName', 'SERVICE_NAME'],
  ['secretToken', 'SECRET_TOKEN'],
  ['serviceVersion', 'SERVICE_VERSION'],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME'],
  ['apiRequestSize', 'API_REQUEST_SIZE', 1024 * 1024],
  ['apiRequestTime', 'API_REQUEST_TIME', 10],
  ['frameworkName', 'FRAMEWORK_NAME'],
  ['frameworkVersion', 'FRAMEWORK_VERSION'],
  ['captureErrorLogStackTraces', 'CAPTURE_ERROR_LOG_STACK_TRACES', config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', 50],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['instrument', 'INSTRUMENT', true],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['sourceLinesErrorAppFrames', 'SOURCE_LINES_ERROR_APP_FRAMES', 5],
  ['sourceLinesErrorLibraryFrames', 'SOURCE_LINES_ERROR_LIBRARY_FRAMES', 5],
  ['sourceLinesSpanAppFrames', 'SOURCE_LINES_SPAN_APP_FRAMES', 0],
  ['sourceLinesSpanLibraryFrames', 'SOURCE_LINES_SPAN_LIBRARY_FRAMES', 0],
  ['errorMessageMaxLength', 'ERROR_MESSAGE_MAX_LENGTH', 2048],
  ['serverTimeout', 'SERVER_TIMEOUT', 30],
  ['disableInstrumentations', 'DISABLE_INSTRUMENTATIONS', []]
]

var falsyValues = [false, 0, '', '0', 'false', 'no', 'off', 'disabled']
var truthyValues = [true, 1, '1', 'true', 'yes', 'on', 'enabled']

optionFixtures.forEach(function (fixture) {
  if (fixture[1]) {
    var bool = typeof fixture[2] === 'boolean'
    var number = typeof fixture[2] === 'number'
    var array = Array.isArray(fixture[2])

    test('should be configurable by envrionment variable ELASTIC_APM_' + fixture[1], function (t) {
      var agent = Agent()
      var value = bool ? (fixture[2] ? '0' : '1') : number ? 1 : 'custom-value'
      process.env['ELASTIC_APM_' + fixture[1]] = value
      agent.start()
      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [ value ])
      } else {
        t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value)
      }
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })

    test('should overwrite ELASTIC_APM_' + fixture[1] + ' by option property ' + fixture[0], function (t) {
      var agent = Agent()
      var opts = {}
      var value1 = bool ? (fixture[2] ? '0' : '1') : number ? 2 : 'overwriting-value'
      var value2 = bool ? (fixture[2] ? '1' : '0') : number ? 1 : 'custom-value'
      opts[fixture[0]] = value1
      process.env['ELASTIC_APM_' + fixture[1]] = value2
      agent.start(opts)
      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [ value1 ])
      } else {
        t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value1)
      }
      delete process.env['ELASTIC_APM_' + fixture[1]]
      t.end()
    })
  }

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    var agent = Agent()
    agent.start()
    if (array) {
      t.deepEqual(agent._conf[fixture[0]], fixture[2])
    } else {
      t.equal(agent._conf[fixture[0]], fixture[2])
    }
    t.end()
  })
})

falsyValues.forEach(function (val) {
  test('should be disabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, false)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

truthyValues.forEach(function (val) {
  test('should be enabled by envrionment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.equal(agent._conf.active, true)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

test('should overwrite ELASTIC_APM_ACTIVE by option property active', function (t) {
  var agent = Agent()
  var opts = { serviceName: 'foo', secretToken: 'baz', active: false }
  process.env.ELASTIC_APM_ACTIVE = '1'
  agent.start(opts)
  t.equal(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  t.end()
})

test('should default active to true if required options have been specified', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'foo', secretToken: 'baz' })
  t.equal(agent._conf.active, true)
  t.end()
})

test('should default active to false if required options have not been specified', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('should force active to false if required options have not been specified', function (t) {
  var agent = Agent()
  agent.start({ active: true })
  t.equal(agent._conf.active, false)
  t.end()
})

test('should default to empty request blacklist arrays', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.ignoreUrlStr.length, 0)
  t.equal(agent._conf.ignoreUrlRegExp.length, 0)
  t.equal(agent._conf.ignoreUserAgentStr.length, 0)
  t.equal(agent._conf.ignoreUserAgentRegExp.length, 0)
  t.end()
})

test('should separate strings and regexes into their own blacklist arrays', function (t) {
  var agent = Agent()
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

test('missing serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.active, false)
  t.end()
})

test('invalid serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start({serviceName: 'foo&bar'})
  t.equal(agent._conf.active, false)
  t.end()
})

test('valid serviceName => active', function (t) {
  var agent = Agent()
  agent.start({serviceName: 'fooBAR0123456789_- '})
  t.equal(agent._conf.active, true)
  t.end()
})

var captureBodyTests = [
  { value: 'off', errors: '[REDACTED]', transactions: '[REDACTED]' },
  { value: 'transactions', errors: '[REDACTED]', transactions: 'test' },
  { value: 'errors', errors: 'test', transactions: '[REDACTED]' },
  { value: 'all', errors: 'test', transactions: 'test' }
]

captureBodyTests.forEach(function (captureBodyTest) {
  test('captureBody => ' + captureBodyTest.value, function (t) {
    t.plan(4)

    var agent = Agent()
    agent.start({
      serviceName: 'test',
      captureExceptions: false,
      captureBody: captureBodyTest.value
    })

    var sendError = agent._apmServer.sendError
    var sendTransaction = agent._apmServer.sendTransaction
    agent._apmServer.sendError = function (error, cb) {
      var request = error.context.request
      t.ok(request)
      t.equal(request.body, captureBodyTest.errors)
      if (cb) process.nextTick(cb)
    }
    agent._apmServer.sendTransaction = function (trans, cb) {
      var request = trans.context.request
      t.ok(request)
      t.equal(request.body, captureBodyTest.transactions)
      if (cb) process.nextTick(cb)
    }
    t.on('end', function () {
      agent._apmServer.sendError = sendError
      agent._apmServer.sendTransaction = sendTransaction
    })

    var req = new IncomingMessage()
    req.socket = { remoteAddress: '127.0.0.1' }
    req.headers['transfer-encoding'] = 'chunked'
    req.headers['content-length'] = 4
    req.body = 'test'

    agent.captureError(new Error('wat'), {request: req})

    var trans = agent.startTransaction()
    trans.req = req
    trans.end()
  })
})

test('disableInstrumentations', function (t) {
  var hapiVersion = require('hapi/package.json').version

  var modules = new Set(Instrumentation.modules)
  if (semver.lt(process.version, '8.3.0')) {
    modules.delete('http2')
  }
  if (semver.lt(process.version, '8.9.0') && semver.gte(hapiVersion, '17.0.0')) {
    modules.delete('hapi')
  }
  if (semver.lt(process.version, '6.0.0')) {
    modules.delete('express-queue')
  }

  function testSlice (t, name, selector) {
    var selection = selector(modules)
    var selectionSet = new Set(typeof selection === 'string' ? selection.split(',') : selection)

    t.test(name + ' -> ' + Array.from(selectionSet).join(','), function (t) {
      var agent = Agent()
      agent.start({
        serviceName: 'service',
        disableInstrumentations: selection
      })

      var found = new Set()

      agent._instrumentation._patchModule = function (exports, name, version, enabled) {
        if (!enabled) found.add(name)
        return exports
      }

      for (const mod of modules) {
        require(mod)
      }

      t.deepEqual(selectionSet, found, 'disabled all selected modules')

      t.end()
    })
  }

  for (const mod of modules) {
    testSlice(t, 'individual modules', () => new Set([mod]))
  }

  testSlice(t, 'multiple modules by array', modules => {
    return Array.from(modules).filter((value, index) => index % 2)
  })

  testSlice(t, 'multiple modules by csv string', modules => {
    return Array.from(modules).filter((value, index) => !(index % 2))
  })

  t.end()
})
