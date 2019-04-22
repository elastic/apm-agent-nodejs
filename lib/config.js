'use strict'

var fs = require('fs')
var path = require('path')

var consoleLogLevel = require('console-log-level')
var ElasticAPMHttpClient = require('elastic-apm-http-client')
var readPkgUp = require('read-pkg-up')
var truncate = require('unicode-byte-truncate')
var entries = require('object.entries')

var version = require('../package').version
var userAgent = 'elastic-apm-node/' + version

config.INTAKE_STRING_MAX_SIZE = 1024
config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER = 'never'
config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES = 'messages'
config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS = 'always'

module.exports = config

var confPath = path.resolve(process.env.ELASTIC_APM_CONFIG_FILE || 'elastic-apm-node.js')
if (fs.existsSync(confPath)) {
  try {
    var confFile = require(confPath)
  } catch (err) {
    console.error('Elastic APM initialization error: Can\'t read config file %s', confPath)
    console.error(err.stack)
  }
}

let serviceName
try {
  serviceName = readPkgUp.sync().pkg.name
} catch (err) {}

var DEFAULTS = {
  verifyServerCert: true,
  active: true,
  logLevel: 'info',
  apiRequestSize: '768kb',
  apiRequestTime: '10s',
  stackTraceLimit: 50,
  captureExceptions: true,
  filterHttpHeaders: true,
  captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  captureSpanStackTraces: true,
  captureBody: 'off',
  errorOnAbortedRequests: false,
  abortedErrorThreshold: '25s',
  instrument: true,
  asyncHooks: true,
  sourceLinesErrorAppFrames: 5,
  sourceLinesErrorLibraryFrames: 5,
  sourceLinesSpanAppFrames: 0,
  sourceLinesSpanLibraryFrames: 0,
  errorMessageMaxLength: '2kb',
  transactionMaxSpans: 500,
  transactionSampleRate: 1.0,
  serverTimeout: '30s',
  disableInstrumentations: [],
  containerId: undefined,
  kubernetesNodeName: undefined,
  kubernetesNamespace: undefined,
  kubernetesPodName: undefined,
  kubernetesPodUID: undefined,
  captureHeaders: true,
  metricsInterval: '30s',
  usePathAsTransactionName: false,
  addPatch: undefined
}

var ENV_TABLE = {
  serviceName: 'ELASTIC_APM_SERVICE_NAME',
  secretToken: 'ELASTIC_APM_SECRET_TOKEN',
  serverUrl: 'ELASTIC_APM_SERVER_URL',
  verifyServerCert: 'ELASTIC_APM_VERIFY_SERVER_CERT',
  serviceVersion: 'ELASTIC_APM_SERVICE_VERSION',
  active: 'ELASTIC_APM_ACTIVE',
  logLevel: 'ELASTIC_APM_LOG_LEVEL',
  hostname: 'ELASTIC_APM_HOSTNAME',
  apiRequestSize: 'ELASTIC_APM_API_REQUEST_SIZE',
  apiRequestTime: 'ELASTIC_APM_API_REQUEST_TIME',
  frameworkName: 'ELASTIC_APM_FRAMEWORK_NAME',
  frameworkVersion: 'ELASTIC_APM_FRAMEWORK_VERSION',
  stackTraceLimit: 'ELASTIC_APM_STACK_TRACE_LIMIT',
  captureExceptions: 'ELASTIC_APM_CAPTURE_EXCEPTIONS',
  filterHttpHeaders: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
  captureErrorLogStackTraces: 'ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES',
  captureSpanStackTraces: 'ELASTIC_APM_CAPTURE_SPAN_STACK_TRACES',
  captureBody: 'ELASTIC_APM_CAPTURE_BODY',
  errorOnAbortedRequests: 'ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS',
  abortedErrorThreshold: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
  instrument: 'ELASTIC_APM_INSTRUMENT',
  asyncHooks: 'ELASTIC_APM_ASYNC_HOOKS',
  sourceLinesErrorAppFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES',
  sourceLinesErrorLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
  sourceLinesSpanAppFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
  sourceLinesSpanLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
  errorMessageMaxLength: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
  transactionMaxSpans: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
  transactionSampleRate: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
  serverTimeout: 'ELASTIC_APM_SERVER_TIMEOUT',
  disableInstrumentations: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
  payloadLogFile: 'ELASTIC_APM_PAYLOAD_LOG_FILE',
  containerId: 'ELASTIC_APM_CONTAINER_ID',
  kubernetesNodeName: 'ELASTIC_APM_KUBERNETES_NODE_NAME',
  kubernetesNamespace: 'ELASTIC_APM_KUBERNETES_NAMESPACE',
  kubernetesPodName: 'ELASTIC_APM_KUBERNETES_POD_NAME',
  kubernetesPodUID: 'ELASTIC_APM_KUBERNETES_POD_UID',
  captureHeaders: 'ELASTIC_APM_CAPTURE_HEADERS',
  metricsInterval: 'ELASTIC_APM_METRICS_INTERVAL',
  usePathAsTransactionName: 'ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME',
  addPatch: 'ELASTIC_APM_ADD_PATCH'
}

var BOOL_OPTS = [
  'verifyServerCert',
  'active',
  'captureExceptions',
  'filterHttpHeaders',
  'captureSpanStackTraces',
  'errorOnAbortedRequests',
  'instrument',
  'asyncHooks',
  'captureHeaders',
  'usePathAsTransactionName'
]

var NUM_OPTS = [
  'stackTraceLimit',
  'sourceLinesErrorAppFrames',
  'sourceLinesErrorLibraryFrames',
  'sourceLinesSpanAppFrames',
  'sourceLinesSpanLibraryFrames',
  'transactionMaxSpans',
  'transactionSampleRate'
]

var TIME_OPTS = [
  'apiRequestTime',
  'abortedErrorThreshold',
  'serverTimeout',
  'metricsInterval'
]

var BYTES_OPTS = [
  'apiRequestSize',
  'errorMessageMaxLength'
]

var MINUS_ONE_EQUAL_INFINITY = [
  'transactionMaxSpans'
]

var ARRAY_OPTS = [
  'disableInstrumentations'
]

var KEY_VALUE_OPTS = [
  'addPatch'
]

function config (opts) {
  opts = Object.assign(
    {},
    DEFAULTS, // default options
    confFile, // options read from elastic-apm-node.js config file
    opts, // options passed in to agent.start()
    readEnv() // options read from environment variables
  )

  // Custom logic for setting serviceName so that an empty string in the config
  // doesn't overwrite the serviceName read from package.json
  if (!opts.serviceName) opts.serviceName = serviceName

  // NOTE: A logger will already exists if a custom logger was given to start()
  if (typeof opts.logger === 'undefined') {
    opts.logger = consoleLogLevel({
      level: opts.logLevel
    })
  }

  normalizeIgnoreOptions(opts)
  normalizeKeyValuePairs(opts)
  normalizeNumbers(opts)
  normalizeBytes(opts)
  normalizeArrays(opts)
  normalizeTime(opts)
  normalizeBools(opts)
  truncateOptions(opts)

  if (typeof opts.transport !== 'function') {
    opts.transport = function httpTransport (conf, agent) {
      var transport = new ElasticAPMHttpClient({
        // metadata
        agentName: 'nodejs',
        agentVersion: version,
        serviceName: conf.serviceName,
        serviceVersion: conf.serviceVersion,
        frameworkName: conf.frameworkName,
        frameworkVersion: conf.frameworkVersion,
        hostname: conf.hostname,

        // Sanitize conf
        truncateKeywordsAt: config.INTAKE_STRING_MAX_SIZE,
        truncateErrorMessagesAt: conf.errorMessageMaxLength,

        // HTTP conf
        secretToken: conf.secretToken,
        userAgent: userAgent,
        serverUrl: conf.serverUrl,
        rejectUnauthorized: conf.verifyServerCert,
        serverTimeout: conf.serverTimeout * 1000,

        // Streaming conf
        size: conf.apiRequestSize,
        time: conf.apiRequestTime * 1000,

        // Debugging
        payloadLogFile: conf.payloadLogFile,

        // Container conf
        containerId: conf.containerId,
        kubernetesNodeName: conf.kubernetesNodeName,
        kubernetesNamespace: conf.kubernetesNamespace,
        kubernetesPodName: conf.kubernetesPodName,
        kubernetesPodUID: conf.kubernetesPodUID
      })

      transport.on('error', err => {
        agent.logger.error('APM Server transport error:', err.stack)
      })

      transport.on('request-error', err => {
        const haveAccepted = Number.isFinite(err.accepted)
        const haveErrors = Array.isArray(err.errors)
        let msg

        if (err.code === 404) {
          msg = 'APM Server responded with "404 Not Found". ' +
            'This might be because you\'re running an incompatible version of the APM Server. ' +
            'This agent only supports APM Server v6.5 and above. ' +
            'If you\'re using an older version of the APM Server, ' +
            'please downgrade this agent to version 1.x or upgrade the APM Server'
        } else if (err.code) {
          msg = `APM Server transport error (${err.code}): ${err.message}`
        } else {
          msg = `APM Server transport error: ${err.message}`
        }

        if (haveAccepted || haveErrors) {
          if (haveAccepted) msg += `\nAPM Server accepted ${err.accepted} events in the last request`
          if (haveErrors) {
            err.errors.forEach(error => {
              msg += `\nError: ${error.message}`
              if (error.document) msg += `\n  Document: ${error.document}`
            })
          }
        } else if (err.response) {
          msg += `\n${err.response}`
        }

        agent.logger.error(msg)
      })

      return transport
    }
  }

  return opts
}

function readEnv () {
  var opts = {}

  Object.keys(ENV_TABLE).forEach(function (key) {
    var env = ENV_TABLE[key]
    if (env in process.env) opts[key] = process.env[env]
  })

  return opts
}

function normalizeIgnoreOptions (opts) {
  opts.ignoreUrlStr = []
  opts.ignoreUrlRegExp = []
  opts.ignoreUserAgentStr = []
  opts.ignoreUserAgentRegExp = []

  if (opts.ignoreUrls) {
    opts.ignoreUrls.forEach(function (ptn) {
      if (typeof ptn === 'string') opts.ignoreUrlStr.push(ptn)
      else opts.ignoreUrlRegExp.push(ptn)
    })
    delete opts.ignoreUrls
  }

  if (opts.ignoreUserAgents) {
    opts.ignoreUserAgents.forEach(function (ptn) {
      if (typeof ptn === 'string') opts.ignoreUserAgentStr.push(ptn)
      else opts.ignoreUserAgentRegExp.push(ptn)
    })
    delete opts.ignoreUserAgents
  }
}

function normalizeNumbers (opts) {
  NUM_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = Number(opts[key])
  })

  MINUS_ONE_EQUAL_INFINITY.forEach(function (key) {
    if (opts[key] === -1) opts[key] = Infinity
  })
}

function normalizeBytes (opts) {
  BYTES_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = bytes(String(opts[key]))
  })
}

function normalizeTime (opts) {
  TIME_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = toSeconds(String(opts[key]))
  })
}

function maybeSplit (separator) {
  return (value) => {
    return typeof value === 'string' ? value.split(separator) : value
  }
}

const maybeSplitValues = maybeSplit(',')
const maybeSplitPairs = maybeSplit('=')

function normalizeArrays (opts) {
  ARRAY_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = maybeSplitValues(opts[key])
  })
}

function normalizeKeyValuePairs (opts) {
  KEY_VALUE_OPTS.forEach(function (key) {
    if (key in opts) {
      if (typeof opts[key] === 'object' && !Array.isArray(opts[key])) {
        opts[key] = entries(opts[key])
        return
      }

      if (!Array.isArray(opts[key])) {
        opts[key] = maybeSplitValues(opts[key])
      }

      if (Array.isArray(opts[key])) {
        opts[key] = opts[key].map(maybeSplitPairs)
      }
    }
  })
}

function normalizeBools (opts) {
  BOOL_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = strictBool(opts.logger, key, opts[key])
  })
}

function truncateOptions (opts) {
  if (opts.serviceVersion) opts.serviceVersion = truncate(String(opts.serviceVersion), config.INTAKE_STRING_MAX_SIZE)
  if (opts.hostname) opts.hostname = truncate(String(opts.hostname), config.INTAKE_STRING_MAX_SIZE)
}

function bytes (input) {
  const matches = input.match(/^(\d+)(b|kb|mb|gb)$/i)
  if (!matches) return Number(input)

  const suffix = matches[2].toLowerCase()
  let value = Number(matches[1])

  if (!suffix || suffix === 'b') {
    return value
  }

  value *= 1024
  if (suffix === 'kb') {
    return value
  }

  value *= 1024
  if (suffix === 'mb') {
    return value
  }

  value *= 1024
  if (suffix === 'gb') {
    return value
  }
}

function toSeconds (value) {
  var matches = /^(-)?(\d+)(m|ms|s)?$/.exec(value)
  if (!matches) return null

  var negate = matches[1]
  var amount = Number(matches[2])
  if (negate) amount = -amount
  var scale = matches[3]

  if (scale === 'm') {
    amount *= 60
  } else if (scale === 'ms') {
    amount /= 1000
  }

  return amount
}

function strictBool (logger, key, value) {
  if (typeof value === 'boolean') {
    return value
  }
  // This will return undefined for unknown inputs, resulting in them being skipped.
  switch (value) {
    case 'false': return false
    case 'true': return true
    default: {
      logger.warn('unrecognized boolean value "%s" for "%s"', value, key)
    }
  }
}
