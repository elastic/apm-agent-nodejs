'use strict'

var os = require('os')
var fs = require('fs')
var path = require('path')
var objectAssign = require('object-assign')
var bool = require('normalize-bool')

module.exports = config

var confPath = path.resolve(process.env.ELASTIC_APM_CONFIG_FILE || 'elastic-apm.js')
if (fs.existsSync(confPath)) {
  try {
    var confFile = require(confPath)
  } catch (err) {
    console.error('Elastic APM initialization error: Can\'t read config file %s', confPath)
    console.error(err.stack)
  }
}

var DEFAULTS = {
  active: true,
  logLevel: 'info',
  hostname: os.hostname(),
  stackTraceLimit: Infinity,
  captureExceptions: true,
  filterHttpHeaders: true,
  captureTraceStackTraces: true,
  logBody: false,
  timeout: true,
  timeoutErrorThreshold: 25000,
  instrument: true,
  ff_captureFrame: false
}

var ENV_TABLE = {
  appName: 'ELASTIC_APM_APP_NAME',
  secretToken: 'ELASTIC_APM_SECRET_TOKEN',
  serverUrl: 'ELASTIC_APM_SERVER_URL',
  active: 'ELASTIC_APM_ACTIVE',
  logLevel: 'ELASTIC_APM_LOG_LEVEL',
  hostname: 'ELASTIC_APM_HOSTNAME',
  stackTraceLimit: 'ELASTIC_APM_STACK_TRACE_LIMIT',
  captureExceptions: 'ELASTIC_APM_CAPTURE_EXCEPTIONS',
  filterHttpHeaders: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
  captureTraceStackTraces: 'ELASTIC_APM_CAPTURE_TRACE_STACK_TRACES',
  logBody: 'ELASTIC_APM_LOG_BODY',
  timeout: 'ELASTIC_APM_TIMEOUT',
  timeoutErrorThreshold: 'ELASTIC_APM_TIMEOUT_ERROR_THRESHOLD',
  instrument: 'ELASTIC_APM_INSTRUMENT',
  flushInterval: 'ELASTIC_APM_FLUSH_INTERVAL',
  ff_captureFrame: 'ELASTIC_APM_FF_CAPTURE_FRAME'
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
    confFile,  // options read from elastic-apm.js config file
    opts       // options passed in to agent.start()
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
