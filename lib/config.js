'use strict'

var os = require('os')
var fs = require('fs')
var path = require('path')
var bool = require('normalize-bool')
var trunc = require('unicode-byte-truncate')

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
  validateServerCert: true,
  active: true,
  logLevel: 'info',
  hostname: os.hostname(),
  stackTraceLimit: 50,
  captureExceptions: true,
  filterHttpHeaders: true,
  captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  captureTraceStackTraces: true,
  logBody: false,
  errorOnAbortedRequests: false,
  abortedErrorThreshold: 25000,
  instrument: true,
  asyncHooks: true,
  sourceContextErrorAppFrames: 5,
  sourceContextErrorLibraryFrames: 5,
  sourceContextTraceAppFrames: 5,
  sourceContextTraceLibraryFrames: 0,
  flushInterval: 10
}

var ENV_TABLE = {
  appName: 'ELASTIC_APM_APP_NAME',
  secretToken: 'ELASTIC_APM_SECRET_TOKEN',
  serverUrl: 'ELASTIC_APM_SERVER_URL',
  validateServerCert: 'ELASTIC_APM_VALIDATE_SERVER_CERT',
  appVersion: 'ELASTIC_APM_APP_VERSION',
  active: 'ELASTIC_APM_ACTIVE',
  logLevel: 'ELASTIC_APM_LOG_LEVEL',
  hostname: 'ELASTIC_APM_HOSTNAME',
  stackTraceLimit: 'ELASTIC_APM_STACK_TRACE_LIMIT',
  captureExceptions: 'ELASTIC_APM_CAPTURE_EXCEPTIONS',
  filterHttpHeaders: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
  captureErrorLogStackTraces: 'ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES',
  captureTraceStackTraces: 'ELASTIC_APM_CAPTURE_TRACE_STACK_TRACES',
  logBody: 'ELASTIC_APM_LOG_BODY',
  errorOnAbortedRequests: 'ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS',
  abortedErrorThreshold: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
  instrument: 'ELASTIC_APM_INSTRUMENT',
  flushInterval: 'ELASTIC_APM_FLUSH_INTERVAL',
  maxQueueSize: 'ELASTIC_APM_MAX_QUEUE_SIZE',
  asyncHooks: 'ELASTIC_APM_ASYNC_HOOKS',
  sourceContextErrorAppFrames: 'ELASTIC_APM_SOURCE_CONTEXT_ERROR_APP_FRAMES',
  sourceContextErrorLibraryFrames: 'ELASTIC_APM_SOURCE_CONTEXT_ERROR_LIBRARY_FRAMES',
  sourceContextTraceAppFrames: 'ELASTIC_APM_SOURCE_CONTEXT_TRACE_APP_FRAMES',
  sourceContextTraceLibraryFrames: 'ELASTIC_APM_SOURCE_CONTEXT_TRACE_LIBRARY_FRAMES'
}

var BOOL_OPTS = [
  'validateServerCert',
  'active',
  'captureExceptions',
  'filterHttpHeaders',
  'captureTraceStackTraces',
  'logBody',
  'errorOnAbortedRequests',
  'instrument',
  'asyncHooks'
]

function config (opts) {
  opts = Object.assign(
    {},
    DEFAULTS,  // default options
    readEnv(), // options read from environment variables
    confFile,  // options read from elastic-apm-node.js config file
    opts       // options passed in to agent.start()
  )

  normalizeIgnoreOptions(opts)
  normalizeBools(opts)
  truncate(opts)

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

function normalizeBools (opts) {
  BOOL_OPTS.forEach(function (key) {
    if (key in opts) opts[key] = bool(opts[key])
  })
}

function truncate (opts) {
  if (opts.appVersion) opts.appVersion = trunc(String(opts.appVersion), config.INTAKE_STRING_MAX_SIZE)
  if (opts.hostname) opts.hostname = trunc(String(opts.hostname), config.INTAKE_STRING_MAX_SIZE)
}
