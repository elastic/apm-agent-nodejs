'use strict'

var os = require('os')
var fs = require('fs')
var path = require('path')
var objectAssign = require('object-assign')
var bool = require('normalize-bool')

module.exports = config

var confPath = path.resolve(process.env.OPBEAT_CONFIG_FILE || 'opbeat.js')
if (fs.existsSync(confPath)) {
  try {
    var confFile = require(confPath)
  } catch (err) {
    console.error('Opbeat initialization error: Can\'t read config file %s', confPath)
    console.error(err.stack)
  }
}

var DEFAULTS = {
  active: true,
  logLevel: 'info',
  hostname: os.hostname(),
  stackTraceLimit: Infinity,
  captureExceptions: true,
  exceptionLogLevel: 'fatal',
  filterHttpHeaders: true,
  captureTraceStackTraces: true,
  logBody: false,
  timeout: true,
  timeoutErrorThreshold: 25000,
  instrument: true,
  ff_captureFrame: false,
  _apiHost: 'intake.opbeat.com'
}

var ENV_TABLE = {
  appId: 'OPBEAT_APP_ID',
  organizationId: 'OPBEAT_ORGANIZATION_ID',
  secretToken: 'OPBEAT_SECRET_TOKEN',
  active: 'OPBEAT_ACTIVE',
  logLevel: 'OPBEAT_LOG_LEVEL',
  hostname: 'OPBEAT_HOSTNAME',
  stackTraceLimit: 'OPBEAT_STACK_TRACE_LIMIT',
  captureExceptions: 'OPBEAT_CAPTURE_EXCEPTIONS',
  exceptionLogLevel: 'OPBEAT_EXCEPTION_LOG_LEVEL',
  filterHttpHeaders: 'OPBEAT_FILTER_HTTP_HEADERS',
  captureTraceStackTraces: 'OPBEAT_CAPTURE_TRACE_STACK_TRACES',
  logBody: 'OPBEAT_LOG_BODY',
  timeout: 'OPBEAT_TIMEOUT',
  timeoutErrorThreshold: 'OPBEAT_TIMEOUT_ERROR_THRESHOLD',
  instrument: 'OPBEAT_INSTRUMENT',
  flushInterval: 'OPBEAT_FLUSH_INTERVAL',
  ff_captureFrame: 'OPBEAT_FF_CAPTURE_FRAME',
  _apiHost: 'OPBEAT_API_HOST', // for testing only - don't use!
  _apiPort: 'OPBEAT_API_PORT', // for testing only - don't use!
  _apiSecure: 'OPBEAT_API_SECURE' // for testing only - don't use!
}

var BOOL_OPTS = [
  'active',
  'captureExceptions',
  'filterHttpHeaders',
  'captureTraceStackTraces',
  'logBody',
  'timeout',
  'instrument',
  'ff_captureFrame'
]

function config (opts) {
  opts = objectAssign(
    {},
    DEFAULTS,  // default options
    readEnv(), // options read from environment variables
    confFile,  // options read from opbeat.js config file
    opts       // options passed in to opbeat.start()
  )

  normalizeIgnoreOptions(opts)
  normalizeBools(opts)

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
