'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')

var normalizeBool = require('normalize-bool')
var truncate = require('unicode-byte-truncate')

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

var DEFAULTS = {
  verifyServerCert: true,
  active: true,
  logLevel: 'info',
  hostname: os.hostname(),
  stackTraceLimit: 50,
  captureExceptions: true,
  filterHttpHeaders: true,
  captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  captureSpanStackTraces: true,
  captureBody: 'off',
  errorOnAbortedRequests: false,
  abortedErrorThreshold: 25000,
  instrument: true,
  asyncHooks: true,
  sourceLinesErrorAppFrames: 5,
  sourceLinesErrorLibraryFrames: 5,
  sourceLinesSpanAppFrames: 0,
  sourceLinesSpanLibraryFrames: 0,
  flushInterval: 10,
  transactionMaxSpans: Infinity,
  transactionSampleRate: 1.0,
  maxQueueSize: 100,
  serverTimeout: 30
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
  flushInterval: 'ELASTIC_APM_FLUSH_INTERVAL',
  maxQueueSize: 'ELASTIC_APM_MAX_QUEUE_SIZE',
  asyncHooks: 'ELASTIC_APM_ASYNC_HOOKS',
  sourceLinesErrorAppFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES',
  sourceLinesErrorLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
  sourceLinesSpanAppFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
  sourceLinesSpanLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
  transactionMaxSpans: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
  transactionSampleRate: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
  serverTimeout: 'ELASTIC_APM_SERVER_TIMEOUT'
}

var BOOL_OPTS = [
  'verifyServerCert',
  'active',
  'captureExceptions',
  'filterHttpHeaders',
  'captureSpanStackTraces',
  'errorOnAbortedRequests',
  'instrument',
  'asyncHooks'
]

var NUM_OPTS = [
  'stackTraceLimit',
  'abortedErrorThreshold',
  'sourceLinesErrorAppFrames',
  'sourceLinesErrorLibraryFrames',
  'sourceLinesSpanAppFrames',
  'sourceLinesSpanLibraryFrames',
  'transactionSampleRate',
  'serverTimeout'
]

function config (opts) {
  opts = Object.assign(
    {},
    DEFAULTS, // default options
    readEnv(), // options read from environment variables
    confFile, // options read from elastic-apm-node.js config file
    opts // options passed in to agent.start()
  )

  normalizeIgnoreOptions(opts)
  normalizeNumbers(opts)
  normalizeBools(opts)
  truncateOptions(opts)

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
}

function normalizeBools (opts) {
  BOOL_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = normalizeBool(opts[key])
  })
}

function truncateOptions (opts) {
  if (opts.serviceVersion) opts.serviceVersion = truncate(String(opts.serviceVersion), config.INTAKE_STRING_MAX_SIZE)
  if (opts.hostname) opts.hostname = truncate(String(opts.hostname), config.INTAKE_STRING_MAX_SIZE)
}
