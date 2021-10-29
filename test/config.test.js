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

const Agent = require('../lib/agent')
const { MockAPMServer } = require('./_mock_apm_server')
const { NoopTransport } = require('../lib/noop-transport')
const { safeGetPackageVersion } = require('./_utils')
var config = require('../lib/config')
var Instrumentation = require('../lib/instrumentation')
var apmVersion = require('../package').version
var apmName = require('../package').name
var isHapiIncompat = require('./_is_hapi_incompat')

// Options to pass to `agent.start()` to turn off some default agent behavior
// that is unhelpful for these tests.
const agentOpts = {
  centralConfig: false,
  captureExceptions: false,
  metricsInterval: '0s',
  cloudProvider: 'none',
  spanFramesMinDuration: -1, // Never discard fast spans.
  logLevel: 'warn'
}
const agentOptsNoopTransport = Object.assign(
  {},
  agentOpts,
  {
    transport: function createNoopTransport () {
      // Avoid accidentally trying to send data to an APM server.
      return new NoopTransport()
    }
  }
)

var optionFixtures = [
  ['abortedErrorThreshold', 'ABORTED_ERROR_THRESHOLD', 25],
  ['active', 'ACTIVE', true],
  ['apiKey', 'API_KEY'],
  ['apiRequestSize', 'API_REQUEST_SIZE', 768 * 1024],
  ['apiRequestTime', 'API_REQUEST_TIME', 10],
  ['asyncHooks', 'ASYNC_HOOKS', true],
  ['captureBody', 'CAPTURE_BODY', 'off'],
  ['captureErrorLogStackTraces', 'CAPTURE_ERROR_LOG_STACK_TRACES', config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['captureSpanStackTraces', 'CAPTURE_SPAN_STACK_TRACES', true],
  ['centralConfig', 'CENTRAL_CONFIG', true],
  ['containerId', 'CONTAINER_ID'],
  ['contextPropagationOnly', 'CONTEXT_PROPAGATION_ONLY', false],
  ['disableSend', 'DISABLE_SEND', false],
  ['disableInstrumentations', 'DISABLE_INSTRUMENTATIONS', []],
  ['environment', 'ENVIRONMENT', 'development'],
  ['errorMessageMaxLength', 'ERROR_MESSAGE_MAX_LENGTH', undefined],
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
  ['longFieldMaxLength', 'LONG_FIELD_MAX_LENGTH', 10000],
  ['maxQueueSize', 'MAX_QUEUE_SIZE', 1024],
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
    var type
    if (typeof fixture[2] === 'boolean') {
      type = 'bool'
    } else if (fixture[0] === 'serverUrl') {
      // special case for url's so they can be parsed using url.parse()
      type = 'url'
    } else if (fixture[0] === 'serverCaCertFile') {
      // special case for files, so a temp file can be written
      type = 'file'
    } else if (typeof fixture[2] === 'number' || fixture[0] === 'errorMessageMaxLength') {
      type = 'number'
    } else if (Array.isArray(fixture[2])) {
      type = 'array'
    } else {
      type = 'string'
    }

    var envName = 'ELASTIC_APM_' + fixture[1]
    var existingValue = process.env[envName]

    test(`should be configurable by environment variable ${envName}`, function (t) {
      var agent = new Agent()
      var value

      switch (type) {
        case 'bool':
          value = !fixture[2]
          break
        case 'number':
          value = 1
          break
        case 'url':
          value = 'http://custom-value'
          break
        case 'file':
          var tmpdir = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
          var tmpfile = path.join(tmpdir, 'custom-file')
          t.on('end', function () { rimraf.sync(tmpdir) })
          mkdirp.sync(tmpdir)
          fs.writeFileSync(tmpfile, tmpfile)
          value = tmpfile
          break
        case 'array':
          value = ['custom-value']
          break
        case 'string':
          value = 'custom-value'
          break
        default:
          t.fail(`missing handling for config var type "${type}"`)
      }

      process.env[envName] = value.toString()

      agent.start(agentOptsNoopTransport)

      switch (type) {
        case 'bool':
          t.strictEqual(agent._conf[fixture[0]], !fixture[2])
          break
        case 'array':
          t.deepEqual(agent._conf[fixture[0]], value)
          break
        default:
          t.strictEqual(agent._conf[fixture[0]], value)
      }

      // Restore process.env state.
      if (existingValue) {
        process.env[envName] = existingValue
      } else {
        delete process.env[envName]
      }

      agent.destroy()
      t.end()
    })

    test(`should overwrite option property ${fixture[0]} by ${envName}`, function (t) {
      var agent = new Agent()
      var opts = {}
      var value1, value2

      switch (type) {
        case 'bool':
          value1 = !fixture[2]
          value2 = fixture[2]
          break
        case 'number':
          value1 = 2
          value2 = 1
          break
        case 'url':
          value1 = 'http://overwriting-value'
          value2 = 'http://custom-value'
          break
        case 'file':
          var tmpdir = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
          var tmpfile = path.join(tmpdir, 'custom-file')
          t.on('end', function () { rimraf.sync(tmpdir) })
          mkdirp.sync(tmpdir)
          fs.writeFileSync(tmpfile, tmpfile)
          value1 = path.join(tmpdir, 'does-not-exist')
          value2 = tmpfile
          break
        case 'array':
          value1 = ['overwriting-value']
          value2 = ['custom-value']
          break
        case 'string':
          value1 = 'overwriting-value'
          value2 = 'custom-value'
          break
        default:
          t.fail(`missing handling for config var type "${type}"`)
      }

      opts[fixture[0]] = value1
      process.env[envName] = value2.toString()

      agent.start(Object.assign({}, agentOptsNoopTransport, opts))

      switch (type) {
        case 'array':
          t.deepEqual(agent._conf[fixture[0]], value2)
          break
        default:
          t.strictEqual(agent._conf[fixture[0]], value2)
      }

      if (existingValue) {
        process.env[envName] = existingValue
      } else {
        delete process.env[envName]
      }

      agent.destroy()
      t.end()
    })
  }

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    if (existingValue) {
      delete process.env[envName]
    }
    var opts = Object.assign({}, agentOptsNoopTransport)
    if (fixture[0] in opts) {
      delete opts[fixture[0]]
    }

    var agent = new Agent().start(opts)

    switch (type) {
      case 'array':
        t.deepEqual(agent._conf[fixture[0]], fixture[2])
        break
      default:
        t.strictEqual(agent._conf[fixture[0]], fixture[2])
    }

    if (existingValue) {
      process.env[envName] = existingValue
    }

    agent.destroy()
    t.end()
  })
})

falsyValues.forEach(function (val) {
  test('should be disabled by environment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = new Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start(Object.assign({}, agentOptsNoopTransport, { serviceName: 'foo', secretToken: 'baz' }))
    t.strictEqual(agent._conf.active, false)
    delete process.env.ELASTIC_APM_ACTIVE
    agent.destroy()
    t.end()
  })
})

truthyValues.forEach(function (val) {
  test('should be enabled by environment variable ELASTIC_APM_ACTIVE set to: ' + util.inspect(val), function (t) {
    var agent = new Agent()
    process.env.ELASTIC_APM_ACTIVE = val
    agent.start(Object.assign({}, agentOptsNoopTransport, { serviceName: 'foo', secretToken: 'baz' }))
    t.strictEqual(agent._conf.active, true)
    delete process.env.ELASTIC_APM_ACTIVE
    agent.destroy()
    t.end()
  })
})

test('should log invalid booleans', function (t) {
  var agent = new Agent()
  var logger = new CaptureLogger()

  agent.start(Object.assign(
    {},
    agentOptsNoopTransport,
    {
      serviceName: 'foo',
      secretToken: 'baz',
      active: 'nope',
      logger
    }
  ))

  t.strictEqual(logger.calls.length, 2)

  var warning = logger.calls.shift()
  t.strictEqual(warning.message, 'unrecognized boolean value "nope" for "active"')

  var debug = logger.calls.shift()
  t.strictEqual(debug.message, 'Elastic APM agent disabled (`active` is false)')

  agent.destroy()
  t.end()
})

var MINUS_ONE_EQUAL_INFINITY = [
  'transactionMaxSpans'
]

MINUS_ONE_EQUAL_INFINITY.forEach(function (key) {
  test(key + ' should be Infinity if set to -1', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = -1
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], Infinity)
    agent.destroy()
    t.end()
  })
})

var bytesValues = [
  'apiRequestSize',
  'errorMessageMaxLength'
]

bytesValues.forEach(function (key) {
  test(key + ' should be converted to a number', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = '1mb'
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], 1024 * 1024)
    agent.destroy()
    t.end()
  })
})

var POSITIVE_TIME_OPTS = [
  'abortedErrorThreshold',
  'apiRequestTime',
  'metricsInterval',
  'serverTimeout'
]
// Time options allowing negative values.
var TIME_OPTS = [
  'spanFramesMinDuration'
]

POSITIVE_TIME_OPTS.forEach(function (key) {
  test(key + ' should guard against a negative time', function (t) {
    var agent = new Agent()
    var logger = new CaptureLogger()
    agent.start(Object.assign(
      {},
      agentOptsNoopTransport,
      {
        [key]: '-1s',
        logger
      }
    ))

    t.strictEqual(agent._conf[key], config.secondsFromTimeStr(config.DEFAULTS[key]),
      'fell back to default value')
    const warning = logger.calls[0]
    t.equal(warning.type, 'warn', 'got a log.warn')
    t.ok(warning.message.indexOf('-1s') !== -1, 'warning message includes the invalid value')
    t.ok(warning.message.indexOf(key) !== -1, 'warning message includes the invalid key')

    agent.destroy()
    t.end()
  })

  test(key + ' should guard against a bogus non-time', function (t) {
    var agent = new Agent()
    var logger = new CaptureLogger()
    agent.start(Object.assign(
      {},
      agentOptsNoopTransport,
      {
        [key]: 'bogusvalue',
        logger
      }
    ))

    t.strictEqual(agent._conf[key], config.secondsFromTimeStr(config.DEFAULTS[key]),
      'fell back to default value')
    const warning = logger.calls[0]
    t.equal(warning.type, 'warn', 'got a log.warn')
    t.ok(warning.message.indexOf('bogusvalue') !== -1, 'warning message includes the invalid value')
    t.ok(warning.message.indexOf(key) !== -1, 'warning message includes the invalid key')

    agent.destroy()
    t.end()
  })
})

POSITIVE_TIME_OPTS.concat(TIME_OPTS).forEach(function (key) {
  test(key + ' should convert minutes to seconds', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = '1m'
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], 60)
    agent.destroy()
    t.end()
  })

  test(key + ' should convert milliseconds to seconds', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = '2000ms'
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], 2)
    agent.destroy()
    t.end()
  })

  test(key + ' should parse seconds', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = '5s'
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], 5)
    agent.destroy()
    t.end()
  })

  test(key + ' should support bare numbers', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = 10
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.strictEqual(agent._conf[key], 10)
    agent.destroy()
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
    var agent = new Agent()
    var opts = {}
    opts[key] = string
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.deepEqual(agent._conf[key], pairs)
    agent.destroy()
    t.end()
  })

  test(key + ' should support object form', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = object
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.deepEqual(agent._conf[key], pairs)
    agent.destroy()
    t.end()
  })

  test(key + ' should support pair form', function (t) {
    var agent = new Agent()
    var opts = {}
    opts[key] = pairs
    agent.start(Object.assign({}, agentOptsNoopTransport, opts))
    t.deepEqual(agent._conf[key], pairs)
    agent.destroy()
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
    var agent = new Agent()
    process.env[envVar] = 'test'
    agent.start(agentOptsNoopTransport)
    delete process.env[envVar]
    t.strictEqual(agent._conf[key], 'test')
    agent.destroy()
    t.end()
  })
})

test('should overwrite option property active by ELASTIC_APM_ACTIVE', function (t) {
  var agent = new Agent()
  var opts = { serviceName: 'foo', secretToken: 'baz', active: true }
  process.env.ELASTIC_APM_ACTIVE = 'false'
  agent.start(Object.assign({}, agentOptsNoopTransport, opts))
  t.strictEqual(agent._conf.active, false)
  delete process.env.ELASTIC_APM_ACTIVE
  agent.destroy()
  t.end()
})

test('should default serviceName to package name', function (t) {
  var agent = new Agent()
  agent.start()
  t.strictEqual(agent._conf.serviceName, 'elastic-apm-node')
  agent.destroy()
  t.end()
})

test('should default to empty request blacklist arrays', function (t) {
  var agent = new Agent()
  agent.start(agentOptsNoopTransport)
  t.strictEqual(agent._conf.ignoreUrlStr.length, 0)
  t.strictEqual(agent._conf.ignoreUrlRegExp.length, 0)
  t.strictEqual(agent._conf.ignoreUserAgentStr.length, 0)
  t.strictEqual(agent._conf.ignoreUserAgentRegExp.length, 0)
  t.strictEqual(agent._conf.transactionIgnoreUrlRegExp.length, 0)
  agent.destroy()
  t.end()
})

test('should separate strings and regexes into their own blacklist arrays', function (t) {
  var agent = new Agent()
  agent.start(Object.assign(
    {},
    agentOptsNoopTransport,
    {
      ignoreUrls: ['str1', /regex1/],
      ignoreUserAgents: ['str2', /regex2/]
    }
  ))

  t.deepEqual(agent._conf.ignoreUrlStr, ['str1'])
  t.deepEqual(agent._conf.ignoreUserAgentStr, ['str2'])

  t.strictEqual(agent._conf.ignoreUrlRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUrlRegExp[0]))
  t.strictEqual(agent._conf.ignoreUrlRegExp[0].toString(), '/regex1/')

  t.strictEqual(agent._conf.ignoreUserAgentRegExp.length, 1)
  t.ok(isRegExp(agent._conf.ignoreUserAgentRegExp[0]))
  t.strictEqual(agent._conf.ignoreUserAgentRegExp[0].toString(), '/regex2/')

  agent.destroy()
  t.end()
})

test('should compile wildcards from string', function (t) {
  var agent = new Agent()
  agent.start(Object.assign(
    {},
    agentOptsNoopTransport,
    {
      transactionIgnoreUrls: ['foo', '/str1', '/wil*card']
    }
  ))

  t.strictEqual(
    agent._conf.transactionIgnoreUrlRegExp.length,
    3,
    'was everything added?'
  )

  agent.destroy()
  t.end()
})

test('invalid serviceName => inactive', function (t) {
  var agent = new Agent()
  agent.start(Object.assign({}, agentOptsNoopTransport, { serviceName: 'foo&bar' }))
  t.strictEqual(agent._conf.active, false)
  agent.destroy()
  t.end()
})

test('valid serviceName => active', function (t) {
  var agent = new Agent()
  agent.start(Object.assign({}, agentOptsNoopTransport, { serviceName: 'fooBAR0123456789_- ' }))
  t.strictEqual(agent._conf.active, true)
  agent.destroy()
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
          var apm = require('elastic-apm-node').start({
            centralConfig: false,
            metricsInterval: '0s',
            logLevel: 'off'
          })
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
    const apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(Object.assign(
        {},
        agentOpts,
        {
          serverUrl,
          captureBody: captureBodyTest.value
        }
      ))

      var req = new IncomingMessage()
      req.socket = { remoteAddress: '127.0.0.1' }
      req.headers['transfer-encoding'] = 'chunked'
      req.headers['content-length'] = 4
      req.body = 'test'

      var trans = agent.startTransaction()
      trans.req = req
      trans.end()

      agent.captureError(new Error('wat'), { request: req },
        function () {
          t.equal(apmServer.events.length, 3, 'apmServer got 3 events')
          let data = apmServer.events[1].transaction
          t.ok(data, 'event 1 is a transaction')
          t.strictEqual(data.context.request.body, captureBodyTest.transactions,
            'transaction.context.request.body is ' + captureBodyTest.transactions)
          data = apmServer.events[2].error
          t.ok(data, 'event 2 is an error')
          t.strictEqual(data.context.request.body, captureBodyTest.errors,
            'error.context.request.body is ' + captureBodyTest.errors)

          agent.destroy()
          apmServer.close()
          t.end()
        }
      )
    })
  })
})

var usePathAsTransactionNameTests = [
  { value: true, url: '/foo/bar?baz=2', transactionName: 'GET /foo/bar' },
  { value: false, url: '/foo/bar?baz=2', transactionName: 'GET unknown route' }
]

usePathAsTransactionNameTests.forEach(function (usePathAsTransactionNameTest) {
  test('usePathAsTransactionName => ' + usePathAsTransactionNameTest.value, function (t) {
    var sentTrans
    var agent = new Agent()
    agent.start(Object.assign(
      {},
      agentOptsNoopTransport,
      {
        usePathAsTransactionName: usePathAsTransactionNameTest.value,
        transport () {
          return {
            sendTransaction (trans, cb) {
              sentTrans = trans
              if (cb) process.nextTick(cb)
            },
            flush (cb) {
              if (cb) process.nextTick(cb)
            }
          }
        }
      }
    ))

    var req = new IncomingMessage()
    req.socket = { remoteAddress: '127.0.0.1' }
    req.url = usePathAsTransactionNameTest.url
    req.method = 'GET'

    var trans = agent.startTransaction()
    trans.req = req
    trans.end()

    agent.flush(function () {
      t.ok(sentTrans, 'sent a transaction')
      t.strictEqual(sentTrans.name, usePathAsTransactionNameTest.transactionName,
        'transaction.name is ' + usePathAsTransactionNameTest.transactionName)

      agent.destroy()
      t.end()
    })
  })
})

test('disableInstrumentations', function (t) {
  var expressGraphqlVersion = require('express-graphql/package.json').version
  var esVersion = safeGetPackageVersion('@elastic/elasticsearch')
  const esCanaryVersion = safeGetPackageVersion('@elastic/elasticsearch-canary')

  // require('apollo-server-core') is a hard crash on nodes < 12.0.0
  const apolloServerCoreVersion = require('apollo-server-core/package.json').version

  var flattenedModules = Instrumentation.modules.reduce((acc, val) => acc.concat(val), [])
  var modules = new Set(flattenedModules)
  if (isHapiIncompat('hapi')) {
    modules.delete('hapi')
  }
  if (isHapiIncompat('@hapi/hapi')) {
    modules.delete('@hapi/hapi')
  }
  if (semver.lt(process.version, '7.6.0') && semver.gte(expressGraphqlVersion, '0.9.0')) {
    modules.delete('express-graphql')
  }
  if (semver.lt(process.version, '10.0.0') && semver.gte(esVersion, '7.12.0')) {
    modules.delete('@elastic/elasticsearch')
  }
  if (semver.lt(process.version, '10.0.0') && semver.gte(esCanaryVersion, '7.12.0')) {
    modules.delete('@elastic/elasticsearch-canary')
  }
  // As of mongodb@4 only supports node >=v12.
  const mongodbVersion = require('../node_modules/mongodb/package.json').version
  if (semver.gte(mongodbVersion, '4.0.0') && semver.lt(process.version, '12.0.0')) {
    modules.delete('mongodb')
  }

  if (semver.gte(apolloServerCoreVersion, '3.0.0') && semver.lt(process.version, '12.0.0')) {
    modules.delete('apollo-server-core')
  }

  function testSlice (t, name, selector) {
    var selection = selector(modules)
    var selectionSet = new Set(typeof selection === 'string' ? selection.split(',') : selection)

    t.test(name + ' -> ' + Array.from(selectionSet).join(','), function (t) {
      var agent = new Agent()
      agent.start(Object.assign(
        {},
        agentOptsNoopTransport,
        { disableInstrumentations: selection }
      ))

      var found = new Set()

      agent._instrumentation._patchModule = function (exports, name, version, enabled) {
        if (!enabled) found.add(name)
        return exports
      }

      for (const mod of modules) {
        require(mod)
      }

      t.deepEqual(selectionSet, found, 'disabled all selected modules')

      agent.destroy()
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
  class MyTransport {
    constructor () {
      this.transactions = []
      this.spans = []
      this.errors = []
    }

    sendTransaction (data, cb) {
      this.transactions.push(data)
      if (cb) setImmediate(cb)
    }

    sendSpan (data, cb) {
      this.spans.push(data)
      if (cb) setImmediate(cb)
    }

    sendError (data, cb) {
      this.errors.push(data)
      if (cb) setImmediate(cb)
    }

    config () {}

    flush (cb) {
      if (cb) setImmediate(cb)
    }
  }
  const myTransport = new MyTransport()

  var agent = new Agent()
  agent.start(Object.assign({}, agentOpts, { transport: () => myTransport }))

  var error = new Error('error')
  var trans = agent.startTransaction('transaction')
  var span = agent.startSpan('span')
  agent.captureError(error)
  span.end()
  trans.end()

  agent.flush(function () {
    t.equal(myTransport.transactions.length, 1, 'received correct number of transactions')
    assertEncodedTransaction(t, trans, myTransport.transactions[0])
    t.equal(myTransport.spans.length, 1, 'received correct number of spans')
    assertEncodedSpan(t, span, myTransport.spans[0])
    t.equal(myTransport.errors.length, 1, 'received correct number of errors')
    assertEncodedError(t, error, myTransport.errors[0], trans, span)
    agent.destroy()
    t.end()
  })
})

test('addPatch', function (t) {
  const before = require('express')
  const patch = require('./_patch')

  delete require.cache[require.resolve('express')]

  const agent = new Agent()
  agent.start(Object.assign(
    {},
    agentOptsNoopTransport,
    {
      addPatch: 'express=./test/_patch.js'
    }
  ))

  t.deepEqual(require('express'), patch(before))

  agent.destroy()
  t.end()
})

test('globalLabels should be received by transport', function (t) {
  var globalLabels = {
    foo: 'bar'
  }

  const apmServer = new MockAPMServer()
  apmServer.start(function (serverUrl) {
    const agent = new Agent().start(Object.assign(
      {},
      agentOpts,
      {
        serverUrl,
        globalLabels
      }
    ))
    agent.captureError(new Error('trigger metadata'),
      function () {
        t.equal(apmServer.events.length, 2, 'apmServer got 2 events')
        const data = apmServer.events[0].metadata
        t.ok(data, 'first event is metadata')
        t.deepEqual(data.labels, globalLabels, 'metadata.labels has globalLabels')
        agent.destroy()
        apmServer.close()
        t.end()
      }
    )
  })
})

test('instrument: false allows manual instrumentation', function (t) {
  const apmServer = new MockAPMServer()
  apmServer.start(function (serverUrl) {
    const agent = new Agent().start(Object.assign(
      {},
      agentOpts,
      {
        serverUrl,
        instrument: false
      }
    ))
    const trans = agent.startTransaction('trans')
    trans.end()
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'apmServer got 2 events')
      const data = apmServer.events[1].transaction
      t.ok(data, 'second event is a transaction')
      assertEncodedTransaction(t, trans, data)
      agent.destroy()
      apmServer.close()
      t.end()
    })
  })
})

test('parsing of ARRAY and KEY_VALUE opts', function (t) {
  var cases = [
    {
      opts: { transactionIgnoreUrls: ['foo', 'bar'] },
      expect: { transactionIgnoreUrls: ['foo', 'bar'] }
    },
    {
      opts: { transactionIgnoreUrls: 'foo' },
      expect: { transactionIgnoreUrls: ['foo'] }
    },
    {
      opts: { transactionIgnoreUrls: 'foo,bar' },
      expect: { transactionIgnoreUrls: ['foo', 'bar'] }
    },
    {
      env: { ELASTIC_APM_TRANSACTION_IGNORE_URLS: 'foo, bar' },
      expect: { transactionIgnoreUrls: ['foo', 'bar'] }
    },
    {
      opts: { transactionIgnoreUrls: ' \tfoo , bar ' },
      expect: { transactionIgnoreUrls: ['foo', 'bar'] }
    },
    {
      opts: { transactionIgnoreUrls: 'foo, bar bling' },
      expect: { transactionIgnoreUrls: ['foo', 'bar bling'] }
    },

    {
      opts: { disableInstrumentations: 'foo, bar' },
      expect: { disableInstrumentations: ['foo', 'bar'] }
    },

    {
      opts: { addPatch: 'foo=./foo.js,bar=./bar.js' },
      expect: { addPatch: [['foo', './foo.js'], ['bar', './bar.js']] }
    },
    {
      opts: { addPatch: ' foo=./foo.js, bar=./bar.js ' },
      expect: { addPatch: [['foo', './foo.js'], ['bar', './bar.js']] }
    },
    {
      env: { ELASTIC_APM_ADD_PATCH: ' foo=./foo.js, bar=./bar.js ' },
      expect: { addPatch: [['foo', './foo.js'], ['bar', './bar.js']] }
    },

    {
      opts: { globalLabels: 'foo=bar, spam=eggs' },
      expect: { globalLabels: [['foo', 'bar'], ['spam', 'eggs']] }
    }
  ]

  cases.forEach(function testOneCase ({ opts, env, expect }) {
    var origEnv = process.env
    try {
      if (env) {
        process.env = Object.assign({}, origEnv, env)
      }
      var cfg = config(opts)
      for (var field in expect) {
        t.deepEqual(cfg[field], expect[field],
          util.format('opts=%j env=%j -> %j', opts, env, expect))
      }
    } finally {
      process.env = origEnv
    }
  })

  t.end()
})

test('transactionSampleRate precision', function (t) {
  var cases = [
    {
      opts: { transactionSampleRate: 0 },
      expect: { transactionSampleRate: 0 }
    },
    {
      env: { ELASTIC_APM_TRANSACTION_SAMPLE_RATE: '0' },
      expect: { transactionSampleRate: 0 }
    },
    {
      opts: { transactionSampleRate: 0.0001 },
      expect: { transactionSampleRate: 0.0001 }
    },
    {
      opts: { transactionSampleRate: 0.00002 },
      expect: { transactionSampleRate: 0.0001 }
    },
    {
      env: { ELASTIC_APM_TRANSACTION_SAMPLE_RATE: '0.00002' },
      expect: { transactionSampleRate: 0.0001 }
    },
    {
      opts: { transactionSampleRate: 0.300000002 },
      expect: { transactionSampleRate: 0.3 }
    },
    {
      opts: { transactionSampleRate: 0.444444 },
      expect: { transactionSampleRate: 0.4444 }
    },
    {
      opts: { transactionSampleRate: 0.555555 },
      expect: { transactionSampleRate: 0.5556 }
    },
    {
      opts: { transactionSampleRate: 1 },
      expect: { transactionSampleRate: 1 }
    }
  ]

  cases.forEach(function testOneCase ({ opts, env, expect }) {
    var origEnv = process.env
    try {
      if (env) {
        process.env = Object.assign({}, origEnv, env)
      }
      var cfg = config(opts)
      for (var field in expect) {
        t.deepEqual(cfg[field], expect[field],
          util.format('opts=%j env=%j -> %j', opts, env, expect))
      }
    } finally {
      process.env = origEnv
    }
  })

  t.end()
})

test('should accept and normalize cloudProvider', function (t) {
  const agentDefault = new Agent()
  agentDefault.start({
    disableSend: true
  })
  t.equals(agentDefault._conf.cloudProvider, 'auto', 'cloudProvider config defaults to auto')
  agentDefault.destroy()

  const agentGcp = new Agent()
  agentGcp.start({
    disableSend: true,
    cloudProvider: 'gcp'
  })
  agentGcp.destroy()
  t.equals(agentGcp._conf.cloudProvider, 'gcp', 'cloudProvider can be set to gcp')

  const agentAzure = new Agent()
  agentAzure.start({
    disableSend: true,
    cloudProvider: 'azure'
  })
  agentAzure.destroy()
  t.equals(agentAzure._conf.cloudProvider, 'azure', 'cloudProvider can be set to azure')

  const agentAws = new Agent()
  agentAws.start({
    disableSend: true,
    cloudProvider: 'aws'
  })
  agentAws.destroy()
  t.equals(agentAws._conf.cloudProvider, 'aws', 'cloudProvider can be set to aws')

  const agentNone = new Agent()
  agentNone.start({
    disableSend: true,
    cloudProvider: 'none'
  })
  agentNone.destroy()
  t.equals(agentNone._conf.cloudProvider, 'none', 'cloudProvider can be set to none')

  const agentUnknown = new Agent()
  agentUnknown.start({
    disableSend: true,
    logLevel: 'off', // Silence the log.warn for the invalid cloudProvider value.
    cloudProvider: 'this-is-not-a-thing'
  })
  agentUnknown.destroy()
  t.equals(agentUnknown._conf.cloudProvider, 'auto', 'unknown cloudProvider defaults to auto')

  const agentGcpFromEnv = new Agent()
  process.env.ELASTIC_APM_CLOUD_PROVIDER = 'gcp'
  agentGcpFromEnv.start({
    disableSend: true
  })
  t.equals(agentGcpFromEnv._conf.cloudProvider, 'gcp', 'cloudProvider can be set via env')
  delete process.env.ELASTIC_APM_CLOUD_PROVIDER
  agentGcpFromEnv.destroy()

  t.end()
})

test('should accept and normalize ignoreMessageQueues', function (suite) {
  suite.test('ignoreMessageQueues defaults', function (t) {
    const agent = new Agent()
    agent.start(agentOptsNoopTransport)
    t.equals(
      agent._conf.ignoreMessageQueues.length,
      0,
      'ignore message queue defaults empty'
    )

    t.equals(
      agent._conf.ignoreMessageQueuesRegExp.length,
      0,
      'ignore message queue regex defaults empty'
    )
    agent.destroy()
    t.end()
  })

  suite.test('ignoreMessageQueues via configuration', function (t) {
    const agent = new Agent()
    agent.start(Object.assign(
      {},
      agentOptsNoopTransport,
      { ignoreMessageQueues: ['f*o', 'bar'] }
    ))
    t.equals(
      agent._conf.ignoreMessageQueues.length,
      2,
      'ignore message picks up configured values'
    )

    t.equals(
      agent._conf.ignoreMessageQueuesRegExp.length,
      2,
      'ignore message queue regex picks up configured values'
    )

    t.ok(
      agent._conf.ignoreMessageQueuesRegExp[0].test('faooooo'),
      'wildcard converted to regular expression'
    )
    agent.destroy()
    t.end()
  })

  suite.test('ignoreMessageQueues via env', function (t) {
    const agent = new Agent()
    process.env.ELASTIC_IGNORE_MESSAGE_QUEUES = 'f*o,bar,baz'
    agent.start(agentOptsNoopTransport)
    t.equals(
      agent._conf.ignoreMessageQueues.length,
      3,
      'ignore message queue picks up env values'
    )

    t.equals(
      agent._conf.ignoreMessageQueuesRegExp.length,
      3,
      'ignore message queue regex picks up env values'
    )

    t.ok(
      agent._conf.ignoreMessageQueuesRegExp[0].test('faooooo'),
      'wildcard converted to regular expression'
    )
    agent.destroy()
    t.end()
  })

  suite.end()
})

// Test User-Agent generation. It would be nice to also test against gherkin
// specs from apm.git.
// https://github.com/elastic/apm/blob/master/tests/agents/gherkin-specs/user_agent.feature
test('userAgentFromConf', t => {
  t.equal(config.userAgentFromConf({}),
    `apm-agent-nodejs/${apmVersion}`)
  t.equal(config.userAgentFromConf({ serviceName: 'foo' }),
    `apm-agent-nodejs/${apmVersion} (foo)`)
  t.equal(config.userAgentFromConf({ serviceName: 'foo', serviceVersion: '1.0.0' }),
    `apm-agent-nodejs/${apmVersion} (foo 1.0.0)`)
  // ISO-8859-1 characters are generally allowed.
  t.equal(config.userAgentFromConf({ serviceName: 'fête', serviceVersion: '2021-été' }),
    `apm-agent-nodejs/${apmVersion} (fête 2021-été)`)
  // Higher code points are replaced with `_`.
  t.equal(config.userAgentFromConf({ serviceName: 'myhomeismy🏰', serviceVersion: 'do you want to build a ☃' }),
    `apm-agent-nodejs/${apmVersion} (myhomeismy__ do you want to build a _)`)

  t.end()
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

  _log (type, message) {
    this.calls.push({
      type,
      message
    })
  }

  fatal (message) { this._log('fatal', message) }
  error (message) { this._log('error', message) }
  warn (message) { this._log('warn', message) }
  info (message) { this._log('info', message) }
  debug (message) { this._log('debug', message) }
  trace (message) { this._log('trace', message) }
}
