'use strict'

var cp = require('child_process')
var fs = require('fs')
var IncomingMessage = require('http').IncomingMessage
var os = require('os')
var path = require('path')
var util = require('util')

var isRegExp = require('core-util-is').isRegExp
var mkdirp = require('mkdirp')
var pFinally = require('p-finally')
var rimraf = require('rimraf')
var semver = require('semver')
var test = require('tape')
var promisify = require('util.promisify')

var Agent = require('./_agent')
var config = require('../lib/config')
var Instrumentation = require('../lib/instrumentation')

var optionFixtures = [
  ['serviceName', 'SERVICE_NAME', 'elastic-apm-node'],
  ['secretToken', 'SECRET_TOKEN'],
  ['serverUrl', 'SERVER_URL'],
  ['verifyServerCert', 'VERIFY_SERVER_CERT', true],
  ['serviceVersion', 'SERVICE_VERSION'],
  ['active', 'ACTIVE', true],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME'],
  ['apiRequestSize', 'API_REQUEST_SIZE', 1024 * 1024],
  ['apiRequestTime', 'API_REQUEST_TIME', 10],
  ['frameworkName', 'FRAMEWORK_NAME'],
  ['frameworkVersion', 'FRAMEWORK_VERSION'],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', 50],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['filterHttpHeaders', 'FILTER_HTTP_HEADERS', true],
  ['captureErrorLogStackTraces', 'CAPTURE_ERROR_LOG_STACK_TRACES', config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES],
  ['captureSpanStackTraces', 'CAPTURE_SPAN_STACK_TRACES', true],
  ['captureBody', 'CAPTURE_BODY', 'off'],
  ['errorOnAbortedRequests', 'ERROR_ON_ABORTED_REQUESTS', false],
  ['abortedErrorThreshold', 'ABORTED_ERROR_THRESHOLD', 25000],
  ['instrument', 'INSTRUMENT', true],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['sourceLinesErrorAppFrames', 'SOURCE_LINES_ERROR_APP_FRAMES', 5],
  ['sourceLinesErrorLibraryFrames', 'SOURCE_LINES_ERROR_LIBRARY_FRAMES', 5],
  ['sourceLinesSpanAppFrames', 'SOURCE_LINES_SPAN_APP_FRAMES', 0],
  ['sourceLinesSpanLibraryFrames', 'SOURCE_LINES_SPAN_LIBRARY_FRAMES', 0],
  ['errorMessageMaxLength', 'ERROR_MESSAGE_MAX_LENGTH', 2048],
  ['transactionMaxSpans', 'TRANSACTION_MAX_SPANS', 500],
  ['transactionSampleRate', 'TRANSACTION_SAMPLE_RATE', 1.0],
  ['serverTimeout', 'SERVER_TIMEOUT', 30],
  ['disableInstrumentations', 'DISABLE_INSTRUMENTATIONS', []]
]

var falsyValues = [false, 0, '', '0', 'false', 'no', 'off', 'disabled']
var truthyValues = [true, 1, '1', 'true', 'yes', 'on', 'enabled']

optionFixtures.forEach(function (fixture) {
  if (fixture[1]) {
    var bool = typeof fixture[2] === 'boolean'
    var url = fixture[0] === 'serverUrl' // special case for url's so they can be parsed using url.parse()
    var number = typeof fixture[2] === 'number'
    var array = Array.isArray(fixture[2])

    test('should be configurable by envrionment variable ELASTIC_APM_' + fixture[1], function (t) {
      var agent = Agent()
      var value

      if (bool) value = !fixture[2]
      else if (number) value = 1
      else if (url) value = 'http://custom-value'
      else value = 'custom-value'

      process.env['ELASTIC_APM_' + fixture[1]] = value.toString()

      agent.start()

      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [ value ])
      } else {
        t.equal(agent._conf[fixture[0]], bool ? !fixture[2] : value)
      }

      delete process.env['ELASTIC_APM_' + fixture[1]]

      t.end()
    })

    test('should overwrite option property ' + fixture[0] + ' by ELASTIC_APM_' + fixture[1], function (t) {
      var agent = Agent()
      var opts = {}
      var value1, value2

      if (bool) {
        value1 = !fixture[2]
        value2 = fixture[2]
      } else if (number) {
        value1 = 2
        value2 = 1
      } else if (url) {
        value1 = 'http://overwriting-value'
        value2 = 'http://custom-value'
      } else {
        value1 = 'overwriting-value'
        value2 = 'custom-value'
      }

      opts[fixture[0]] = value1
      process.env['ELASTIC_APM_' + fixture[1]] = value2.toString()

      agent.start(opts)

      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [ value2 ])
      } else {
        t.equal(agent._conf[fixture[0]], value2)
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

var MINUS_ONE_EQUAL_INFINITY = [
  'transactionMaxSpans'
]

MINUS_ONE_EQUAL_INFINITY.forEach(function (key) {
  test(key + ' should be Infinity if set to -1', function (t) {
    var agent = Agent()
    var opts = {}
    opts[key] = -1
    agent.start(opts)
    t.equal(agent._conf[key], Infinity)
    t.end()
  })
})

test('should overwrite option property active by ELASTIC_APM_ACTIVE', function (t) {
  var agent = Agent()
  var opts = { serviceName: 'foo', secretToken: 'baz', active: true }
  process.env.ELASTIC_APM_ACTIVE = '0'
  agent.start(opts)
  t.equal(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  t.end()
})

test('should default serviceName to package name', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.serviceName, 'elastic-apm-node')
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

test('invalid serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'foo&bar' })
  t.equal(agent._conf.active, false)
  t.end()
})

test('valid serviceName => active', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'fooBAR0123456789_- ' })
  t.equal(agent._conf.active, true)
  t.end()
})

test('serviceName defaults to package name', function (t) {
  var mkdirpPromise = promisify(mkdirp)
  var rimrafPromise = promisify(rimraf)
  var writeFile = promisify(fs.writeFile)
  var symlink = promisify(fs.symlink)
  var exec = promisify(cp.exec)

  function testServiceConfig (pkg, handle) {
    var tmp = path.join(os.tmpdir(), 'elastic-apm-node-test')
    var files = [
      {
        action: 'mkdirp',
        dir: tmp
      },
      {
        action: 'create',
        path: path.join(tmp, 'package.json'),
        contents: JSON.stringify(pkg)
      },
      {
        action: 'create',
        path: path.join(tmp, 'index.js'),
        contents: `
          var apm = require('elastic-apm-node').start()
          console.log(JSON.stringify(apm._conf))
        `
      },
      {
        action: 'mkdirp',
        dir: path.join(tmp, 'node_modules')
      },
      {
        action: 'symlink',
        from: path.resolve(__dirname, '..'),
        to: path.join(tmp, 'node_modules/elastic-apm-node')
      }
    ]

    // NOTE: Reduce the sequence to a promise chain rather
    // than using Promise.all(), as the tasks are dependent.
    let promise = files.reduce((p, file) => {
      return p.then(() => {
        switch (file.action) {
          case 'create': {
            return writeFile(file.path, file.contents)
          }
          case 'mkdirp': {
            return mkdirpPromise(file.dir)
          }
          case 'symlink': {
            return symlink(file.from, file.to)
          }
        }
      })
    }, Promise.resolve())

    promise = promise
      .then(() => {
        return exec('node index.js', {
          cwd: tmp
        })
      })
      .then(result => {
        // NOTE: Real util.promisify returns an object,
        // the polyfill just returns stdout as a string.
        return JSON.parse(result.stdout || result)
      })

    return pFinally(promise, () => {
      return rimrafPromise(tmp)
    })
  }

  t.test('should be active when valid', function (t) {
    var pkg = {
      name: 'valid'
    }

    return testServiceConfig(pkg).then(conf => {
      t.equal(conf.active, true)
      t.equal(conf.serviceName, pkg.name)
      t.end()
    })
  })

  t.test('should be inactive when blank', function (t) {
    var pkg = {
      name: ''
    }

    return testServiceConfig(pkg).then(conf => {
      t.equal(conf.active, false)
      t.equal(conf.serviceName, pkg.name)
      t.end()
    })
  })

  t.test('should be inactive when missing', function (t) {
    var pkg = {}

    return testServiceConfig(pkg).then(conf => {
      t.equal(conf.active, false)
      t.end()
    })
  })
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

    agent.captureError(new Error('wat'), { request: req })

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
    modules.delete('apollo-server-core')
  }

  function testSlice (t, name, selector) {
    var selection = selector(modules)
    var selectionSet = new Set(typeof selection === 'string' ? selection.split(',') : selection)

    t.test(name + ' -> ' + Array.from(selectionSet).join(','), function (t) {
      var agent = Agent()
      agent.start({
        serviceName: 'service',
        disableInstrumentations: selection,
        captureExceptions: false
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
