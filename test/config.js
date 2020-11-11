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

var Agent = require('./_agent')
var APMServer = require('./_apm_server')
var config = require('../lib/config')
var Instrumentation = require('../lib/instrumentation')
var apmVersion = require('../package').version
var apmName = require('../package').name

process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
process.env.ELASTIC_APM_CENTRAL_CONFIG = 'false'
process.env._ELASTIC_APM_ASYNC_HOOKS_RESETTABLE = 'true'

var optionFixtures = [
  ['abortedErrorThreshold', 'ABORTED_ERROR_THRESHOLD', 25],
  ['active', 'ACTIVE', true],
  ['apiRequestSize', 'API_REQUEST_SIZE', 768 * 1024],
  ['apiRequestTime', 'API_REQUEST_TIME', 10],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['captureBody', 'CAPTURE_BODY', 'off'],
  ['captureErrorLogStackTraces', 'CAPTURE_ERROR_LOG_STACK_TRACES', config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['captureSpanStackTraces', 'CAPTURE_SPAN_STACK_TRACES', true],
  ['centralConfig', 'CENTRAL_CONFIG', true],
  ['containerId', 'CONTAINER_ID'],
  ['disableInstrumentations', 'DISABLE_INSTRUMENTATIONS', []],
  ['environment', 'ENVIRONMENT', 'development'],
  ['errorMessageMaxLength', 'ERROR_MESSAGE_MAX_LENGTH', 2048],
  ['errorOnAbortedRequests', 'ERROR_ON_ABORTED_REQUESTS', false],
  ['filterHttpHeaders', 'FILTER_HTTP_HEADERS', true],
  ['frameworkName', 'FRAMEWORK_NAME'],
  ['frameworkVersion', 'FRAMEWORK_VERSION'],
  ['hostname', 'HOSTNAME'],
  ['instrument', 'INSTRUMENT', true],
  ['instrumentIncomingHTTPRequests', 'INSTRUMENT_INCOMING_HTTP_REQUESTS', true],
  ['kubernetesNamespace', 'KUBERNETES_NAMESPACE'],
  ['kubernetesNodeName', 'KUBERNETES_NODE_NAME'],
  ['kubernetesPodName', 'KUBERNETES_POD_NAME'],
  ['kubernetesPodUID', 'KUBERNETES_POD_UID'],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['logUncaughtExceptions', 'LOG_UNCAUGHT_EXCEPTIONS', false],
  ['metricsInterval', 'METRICS_INTERVAL', 30],
  ['metricsLimit', 'METRICS_LIMIT', 1000],
  ['secretToken', 'SECRET_TOKEN'],
  ['serverCaCertFile', 'SERVER_CA_CERT_FILE'],
  ['serverTimeout', 'SERVER_TIMEOUT', 30],
  ['serverUrl', 'SERVER_URL'],
  ['serviceName', 'SERVICE_NAME', apmName],
  ['serviceNodeName', 'SERVICE_NODE_NAME'],
  ['serviceVersion', 'SERVICE_VERSION', apmVersion],
  ['sourceLinesErrorAppFrames', 'SOURCE_LINES_ERROR_APP_FRAMES', 5],
  ['sourceLinesErrorLibraryFrames', 'SOURCE_LINES_ERROR_LIBRARY_FRAMES', 5],
  ['sourceLinesSpanAppFrames', 'SOURCE_LINES_SPAN_APP_FRAMES', 0],
  ['sourceLinesSpanLibraryFrames', 'SOURCE_LINES_SPAN_LIBRARY_FRAMES', 0],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', 50],
  ['transactionMaxSpans', 'TRANSACTION_MAX_SPANS', 500],
  ['transactionSampleRate', 'TRANSACTION_SAMPLE_RATE', 1.0],
  ['usePathAsTransactionName', 'USE_PATH_AS_TRANSACTION_NAME', false],
  ['verifyServerCert', 'VERIFY_SERVER_CERT', true]
]

var falsyValues = [false, 'false']
var truthyValues = [true, 'true']

optionFixtures.forEach(function (fixture) {
  if (fixture[1]) {
    var bool = typeof fixture[2] === 'boolean'
    var url = fixture[0] === 'serverUrl' // special case for url's so they can be parsed using url.parse()
    var file = fixture[0] === 'serverCaCertFile' // special case for files, so a temp file can be written
    var number = typeof fixture[2] === 'number'
    var array = Array.isArray(fixture[2])
    var envName = 'ELASTIC_APM_' + fixture[1]
    var existingValue = process.env[envName]

    test(`should be configurable by environment variable ${envName}`, function (t) {
      var agent = Agent()
      var value

      if (bool) value = !fixture[2]
      else if (number) value = 1
      else if (url) value = 'http://custom-value'
      else if (file) {
        var tmpdir = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
        var tmpfile = path.join(tmpdir, 'custom-file')
        t.on('end', function () { rimraf.sync(tmpdir) })
        mkdirp.sync(tmpdir)
        fs.writeFileSync(tmpfile, tmpfile)
        value = tmpfile
      } else value = 'custom-value'

      process.env[envName] = value.toString()

      agent.start()

      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [value])
      } else {
        t.strictEqual(agent._conf[fixture[0]], bool ? !fixture[2] : value)
      }

      if (existingValue) {
        process.env[envName] = existingValue
      } else {
        delete process.env[envName]
      }

      t.end()
    })

    test(`should overwrite option property ${fixture[0]} by ${envName}`, function (t) {
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
      } else if (file) {
        var tmpdir = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
        var tmpfile = path.join(tmpdir, 'custom-file')
        t.on('end', function () { rimraf.sync(tmpdir) })
        mkdirp.sync(tmpdir)
        fs.writeFileSync(tmpfile, tmpfile)
        value1 = path.join(tmpdir, 'does-not-exist')
        value2 = tmpfile
      } else {
        value1 = 'overwriting-value'
        value2 = 'custom-value'
      }

      opts[fixture[0]] = value1
      process.env[envName] = value2.toString()

      agent.start(opts)

      if (array) {
        t.deepEqual(agent._conf[fixture[0]], [value2])
      } else {
        t.strictEqual(agent._conf[fixture[0]], value2)
      }

      if (existingValue) {
        process.env[envName] = existingValue
      } else {
        delete process.env[envName]
      }

      t.end()
    })
  }

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    if (existingValue) {
      delete process.env[envName]
    }

    var agent = Agent()
    agent.start()
    if (array) {
      t.deepEqual(agent._conf[fixture[0]], fixture[2])
    } else {
      t.strictEqual(agent._conf[fixture[0]], fixture[2])
    }

    if (existingValue) {
      process.env[envName] = existingValue
    }

    t.end()
  })
})

falsyValues.forEach(function (val) {
  test('should be disabled by environment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.strictEqual(agent._conf.active, false)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

truthyValues.forEach(function (val) {
  test('should be enabled by environment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start({ serviceName: 'foo', secretToken: 'baz' })
    t.strictEqual(agent._conf.active, true)
    delete process.env.ELASTIC_APM_ACTIVE
    t.end()
  })
})

test('should log invalid booleans', function (t) {
  var agent = Agent()
  var logger = new CaptureLogger()

  agent.start({
    serviceName: 'foo',
    secretToken: 'baz',
    active: 'nope',
    logger
  })

  t.strictEqual(logger.calls.length, 2)

  var warning = logger.calls.shift()
  t.strictEqual(warning.message, 'unrecognized boolean value "%s" for "%s"')
  t.strictEqual(warning.args[0], 'nope')
  t.strictEqual(warning.args[1], 'active')

  var debug = logger.calls.shift()
  t.strictEqual(debug.message, 'Elastic APM agent disabled (`active` is false)')
  t.strictEqual(debug.args.length, 0)

  t.end()
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
    t.strictEqual(agent._conf[key], Infinity)
    t.end()
  })
})

var bytesValues = [
  'apiRequestSize',
  'errorMessageMaxLength'
]

bytesValues.forEach(function (key) {
  test(key + ' should be converted to a number', function (t) {
    var agent = Agent()
    var opts = {}
    opts[key] = '1mb'
    agent.start(opts)
    t.strictEqual(agent._conf[key], 1024 * 1024)
    t.end()
  })
})

var timeValues = [
  'abortedErrorThreshold',
  'apiRequestTime',
  'metricsInterval',
  'serverTimeout'
]

timeValues.forEach(function (key) {
  test(key + ' should convert minutes to seconds', function (t) {
    if (key === 'metricsInterval') {
      delete process.env.ELASTIC_APM_METRICS_INTERVAL
      t.on('end', function () {
        process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
      })
    }

    var agent = Agent()
    var opts = {}
    opts[key] = '1m'
    agent.start(opts)
    t.strictEqual(agent._conf[key], 60)
    t.end()
  })

  test(key + ' should convert milliseconds to seconds', function (t) {
    if (key === 'metricsInterval') {
      delete process.env.ELASTIC_APM_METRICS_INTERVAL
      t.on('end', function () {
        process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
      })
    }

    var agent = Agent()
    var opts = {}
    opts[key] = '2000ms'
    agent.start(opts)
    t.strictEqual(agent._conf[key], 2)
    t.end()
  })

  test(key + ' should parse seconds', function (t) {
    if (key === 'metricsInterval') {
      delete process.env.ELASTIC_APM_METRICS_INTERVAL
      t.on('end', function () {
        process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
      })
    }

    var agent = Agent()
    var opts = {}
    opts[key] = '5s'
    agent.start(opts)
    t.strictEqual(agent._conf[key], 5)
    t.end()
  })

  test(key + ' should support bare numbers', function (t) {
    if (key === 'metricsInterval') {
      delete process.env.ELASTIC_APM_METRICS_INTERVAL
      t.on('end', function () {
        process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
      })
    }

    var agent = Agent()
    var opts = {}
    opts[key] = 10
    agent.start(opts)
    t.strictEqual(agent._conf[key], 10)
    t.end()
  })
})

var keyValuePairValues = [
  'addPatch',
  'globalLabels'
]

keyValuePairValues.forEach(function (key) {
  var string = 'foo=bar,baz=buz'
  var object = { foo: 'bar', baz: 'buz' }
  var pairs = [
    [
      'foo',
      'bar'
    ],
    [
      'baz',
      'buz'
    ]
  ]

  test(key + ' should support string form', function (t) {
    var agent = Agent()
    var opts = {}
    opts[key] = string
    agent._config(opts)
    t.deepEqual(agent._conf[key], pairs)
    t.end()
  })

  test(key + ' should support object form', function (t) {
    var agent = Agent()
    var opts = {}
    opts[key] = object
    agent._config(opts)
    t.deepEqual(agent._conf[key], pairs)
    t.end()
  })

  test(key + ' should support pair form', function (t) {
    var agent = Agent()
    var opts = {}
    opts[key] = pairs
    agent._config(opts)
    t.deepEqual(agent._conf[key], pairs)
    t.end()
  })
})

var noPrefixValues = [
  ['kubernetesNodeName', 'KUBERNETES_NODE_NAME'],
  ['kubernetesNamespace', 'KUBERNETES_NAMESPACE'],
  ['kubernetesPodName', 'KUBERNETES_POD_NAME'],
  ['kubernetesPodUID', 'KUBERNETES_POD_UID']
]

noPrefixValues.forEach(function (pair) {
  const [key, envVar] = pair
  test(`maps ${envVar} to ${key}`, (t) => {
    var agent = Agent()
    process.env[envVar] = 'test'
    agent.start()
    delete process.env[envVar]
    t.strictEqual(agent._conf[key], 'test')
    t.end()
  })
})

test('should overwrite option property active by ELASTIC_APM_ACTIVE', function (t) {
  var agent = Agent()
  var opts = { serviceName: 'foo', secretToken: 'baz', active: true }
  process.env.ELASTIC_APM_ACTIVE = 'false'
  agent.start(opts)
  t.strictEqual(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  t.end()
})

test('should default serviceName to package name', function (t) {
  var agent = Agent()
  agent.start()
  t.strictEqual(agent._conf.serviceName, 'elastic-apm-node')
  t.end()
})

test('should default to empty request blacklist arrays', function (t) {
  var agent = Agent()
  agent.start()
  t.strictEqual(agent._conf.ignoreUrlStr.length, 0)
  t.strictEqual(agent._conf.ignoreUrlRegExp.length, 0)
  t.strictEqual(agent._conf.ignoreUserAgentStr.length, 0)
  t.strictEqual(agent._conf.ignoreUserAgentRegExp.length, 0)
  t.strictEqual(agent._conf.transactionIgnoreUrlRegExp.length, 0)
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

  t.strictEqual(agent._conf.ignoreUrlRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUrlRegExp[0]))
  t.strictEqual(agent._conf.ignoreUrlRegExp[0].toString(), '/regex1/')

  t.strictEqual(agent._conf.ignoreUserAgentRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUserAgentRegExp[0]))
  t.strictEqual(agent._conf.ignoreUserAgentRegExp[0].toString(), '/regex2/')

  t.end()
})

test('should compile wildcards from string', function (t) {
  var agent = Agent()
  agent.start({
    transactionIgnoreUrls: ['foo', '/str1', '/wil*card']
  })

  t.strictEqual(
    agent._conf.transactionIgnoreUrlRegExp.length,
    3,
    'was everything added?'
  )

  t.strictEquals(
    '/foo'.search(agent._conf.transactionIgnoreUrlRegExp[0]),
    0,
    'was leading / added automatically to "foo"'
  )

  t.end()
})

test('invalid serviceName => inactive', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'foo&bar' })
  t.strictEqual(agent._conf.active, false)
  t.end()
})

test('valid serviceName => active', function (t) {
  var agent = Agent()
  agent.start({ serviceName: 'fooBAR0123456789_- ' })
  t.strictEqual(agent._conf.active, true)
  t.end()
})

test('serviceName defaults to package name', function (t) {
  var mkdirpPromise = util.promisify(mkdirp)
  var rimrafPromise = util.promisify(rimraf)
  var writeFile = util.promisify(fs.writeFile)
  var symlink = util.promisify(fs.symlink)
  var exec = util.promisify(cp.exec)

  function testServiceConfig (pkg, handle) {
    var tmp = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
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
      }
    ]

    if (process.platform === 'win32') {
      files.push({
        action: 'npm link',
        from: path.resolve(__dirname, '..'),
        to: tmp
      })
    } else {
      files.push({
        action: 'symlink',
        from: path.resolve(__dirname, '..'),
        to: path.join(tmp, 'node_modules/elastic-apm-node')
      })
    }

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
          case 'npm link': {
            return exec('npm link', {
              cwd: file.from
            }).then(() => {
              return exec('npm link elastic-apm-node', {
                cwd: file.to
              })
            })
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
        return JSON.parse(result.stdout)
      })
      .catch(err => {
        t.error(err)
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
      t.strictEqual(conf.active, true)
      t.strictEqual(conf.serviceName, pkg.name)
      t.end()
    })
  })

  t.test('should be inactive when blank', function (t) {
    var pkg = {
      name: ''
    }

    return testServiceConfig(pkg).then(conf => {
      t.strictEqual(conf.active, false)
      t.strictEqual(conf.serviceName, pkg.name)
      t.end()
    })
  })

  t.test('should be inactive when missing', function (t) {
    var pkg = {}

    return testServiceConfig(pkg).then(conf => {
      t.strictEqual(conf.active, false)
      t.end()
    })
  })

  t.test('serviceVersion should default to package version', function (t) {
    var pkg = {
      version: '1.2.3'
    }

    return testServiceConfig(pkg).then(conf => {
      t.strictEqual(conf.serviceVersion, pkg.version)
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

    var sendError = agent._transport.sendError
    var sendTransaction = agent._transport.sendTransaction
    agent._transport.sendError = function (error, cb) {
      var request = error.context.request
      t.ok(request)
      t.strictEqual(request.body, captureBodyTest.errors)
      if (cb) process.nextTick(cb)
    }
    agent._transport.sendTransaction = function (trans, cb) {
      var request = trans.context.request
      t.ok(request)
      t.strictEqual(request.body, captureBodyTest.transactions)
      if (cb) process.nextTick(cb)
    }
    t.on('end', function () {
      agent._transport.sendError = sendError
      agent._transport.sendTransaction = sendTransaction
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

var usePathAsTransactionNameTests = [
  { value: true, url: '/foo/bar?baz=2', transactionName: 'GET /foo/bar' },
  { value: false, url: '/foo/bar?baz=2', transactionName: 'GET unknown route' }
]

usePathAsTransactionNameTests.forEach(function (usePathAsTransactionNameTest) {
  test('usePathAsTransactionName => ' + usePathAsTransactionNameTest.value, function (t) {
    t.plan(2)

    var agent = Agent()
    agent.start({
      serviceName: 'test',
      captureExceptions: false,
      usePathAsTransactionName: usePathAsTransactionNameTest.value
    })

    var sendTransaction = agent._transport.sendTransaction
    agent._transport.sendTransaction = function (trans, cb) {
      t.ok(trans)
      t.strictEqual(trans.name, usePathAsTransactionNameTest.transactionName)
      if (cb) process.nextTick(cb)
    }
    t.on('end', function () {
      agent._transport.sendTransaction = sendTransaction
    })

    var req = new IncomingMessage()
    req.socket = { remoteAddress: '127.0.0.1' }
    req.url = usePathAsTransactionNameTest.url
    req.method = 'GET'

    var trans = agent.startTransaction()
    trans.req = req
    trans.end()
  })
})

test('disableInstrumentations', function (t) {
  var hapiVersion = require('hapi/package.json').version
  var expressGraphqlVersion = require('express-graphql/package.json').version

  var flattenedModules = Instrumentation.modules.reduce((acc, val) => acc.concat(val), [])
  var modules = new Set(flattenedModules)
  if (semver.lt(process.version, '8.9.0') && semver.gte(hapiVersion, '17.0.0')) {
    modules.delete('hapi')
  }
  if (semver.lt(process.version, '8.9.0')) {
    modules.delete('@hapi/hapi')
  }
  if (semver.lt(process.version, '7.6.0') && semver.gte(expressGraphqlVersion, '0.9.0')) {
    modules.delete('express-graphql')
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

test('custom transport', function (t) {
  var agent = Agent()
  agent.start({
    captureExceptions: false,
    serviceName: 'fooBAR0123456789_- ',
    transport () {
      var transactions = []
      var spans = []
      var errors = []
      function makeSenderFor (list) {
        return (item, callback) => {
          list.push(item)
          if (callback) {
            setImmediate(callback)
          }
        }
      }
      var first = true
      return {
        sendTransaction: makeSenderFor(transactions),
        sendSpan: makeSenderFor(spans),
        sendError: makeSenderFor(errors),
        config: () => {},
        flush (cb) {
          if (cb) setImmediate(cb)
          if (first) {
            // first flush is from calling `agent.flush()` below, second flush
            // is done by the internals of `captureError()`. This logic will
            // change once the following issue is implemented:
            // https://github.com/elastic/apm-agent-nodejs/issues/686
            first = false
            return
          }

          // add slight delay to give the span time to be fully encoded and sent
          setTimeout(function () {
            t.strictEqual(transactions.length, 1, 'received correct number of transactions')
            assertEncodedTransaction(t, trans, transactions[0])
            t.strictEqual(spans.length, 1, 'received correct number of spans')
            assertEncodedSpan(t, span, spans[0])
            t.strictEqual(errors.length, 1, 'received correct number of errors')
            assertEncodedError(t, error, errors[0], trans, span)
            t.end()
          }, 200)
        }
      }
    }
  })

  var error = new Error('error')
  var trans = agent.startTransaction('transaction')
  var span = agent.startSpan('span')
  agent.captureError(error)
  span.end()
  trans.end()
  agent.flush()
})

test('addPatch', function (t) {
  const before = require('express')
  const patch = require('./_patch')

  delete require.cache[require.resolve('express')]

  const agent = Agent()
  agent.start({
    addPatch: 'express=./test/_patch.js',
    captureExceptions: false
  })

  t.deepEqual(require('express'), patch(before))

  t.end()
})

test('globalLabels should be received by transport', function (t) {
  var globalLabels = {
    foo: 'bar'
  }
  var opts = { globalLabels }

  var server = APMServer(opts, { expect: 'error' })
    .on('listening', function () {
      this.agent.captureError(new Error('trigger metadata'))
    })
    .on('data-metadata', (data) => {
      t.deepEqual(data.labels, globalLabels)
      t.end()
    })

  t.on('end', function () {
    server.destroy()
  })
})

test('instrument: false allows manual instrumentation', function (t) {
  var trans
  var opts = {
    metricsInterval: 0,
    instrument: false
  }

  var server = APMServer(opts, { expect: 'transaction' })
    .on('listening', function () {
      trans = this.agent.startTransaction('trans')
      trans.end()
      this.agent.flush()
    })
    .on('data-transaction', (data) => {
      assertEncodedTransaction(t, trans, data)
      t.end()
    })

  t.on('end', function () {
    server.destroy()
  })
})

function assertEncodedTransaction (t, trans, result) {
  t.comment('transaction')
  t.strictEqual(result.id, trans.id, 'id matches')
  t.strictEqual(result.trace_id, trans.traceId, 'trace id matches')
  t.strictEqual(result.parent_id, trans.parentId, 'parent id matches')
  t.strictEqual(result.name, trans.name, 'name matches')
  t.strictEqual(result.type, trans.type || 'custom', 'type matches')
  t.strictEqual(result.duration, trans._timer.duration, 'duration matches')
  t.strictEqual(result.timestamp, trans.timestamp, 'timestamp matches')
  t.strictEqual(result.result, trans.result, 'result matches')
  t.strictEqual(result.sampled, trans.sampled, 'sampled matches')
}

function assertEncodedSpan (t, span, result) {
  t.comment('span')
  t.strictEqual(result.id, span.id, 'id matches')
  t.strictEqual(result.transaction_id, span.transaction.id, 'transaction id matches')
  t.strictEqual(result.trace_id, span.traceId, 'trace id matches')
  t.strictEqual(result.parent_id, span.parentId, 'parent id matches')
  t.strictEqual(result.name, span.name, 'name matches')
  t.strictEqual(result.type, span.type || 'custom', 'type matches')
  t.strictEqual(result.duration, span._timer.duration, 'duration matches')
  t.strictEqual(result.timestamp, span.timestamp, 'timestamp matches')
}

function assertEncodedError (t, error, result, trans, parent) {
  t.comment('error')
  t.ok(result.id, 'has a valid id')
  t.strictEqual(result.trace_id, trans.traceId, 'trace id matches')
  t.strictEqual(result.transaction_id, trans.id, 'transaction id matches')
  t.strictEqual(result.parent_id, parent.id, 'parent id matches')
  t.ok(result.exception, 'has an exception object')
  t.strictEqual(result.exception.message, error.message, 'exception message matches')
  t.strictEqual(result.exception.type, error.constructor.name, 'exception type matches')
  t.ok(result.culprit, 'has a valid culprit')
  t.ok(result.timestamp, 'has a valid timestamp')
}

class CaptureLogger {
  constructor () {
    this.calls = []
  }

  _log (type, message, args) {
    this.calls.push({
      type,
      message,
      args
    })
  }

  warn (message, ...args) {
    this._log('warn', message, args)
  }

  info (message, ...args) {
    this._log('info', message, args)
  }

  debug (message, ...args) {
    this._log('debug', message, args)
  }
}
