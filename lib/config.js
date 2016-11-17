'use strict'

var os = require('os')

var OPTS_MATRIX = [
  ['appId', 'APP_ID'],
  ['organizationId', 'ORGANIZATION_ID'],
  ['secretToken', 'SECRET_TOKEN'],
  ['active', 'ACTIVE', true],
  ['logLevel', 'LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME', os.hostname()],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', Infinity],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['exceptionLogLevel', 'EXCEPTION_LOG_LEVEL', 'fatal'],
  ['filterHttpHeaders', 'FILTER_HTTP_HEADERS', true],
  ['logBody', 'LOG_BODY', false],
  ['timeout', 'TIMEOUT', true],
  ['timeoutErrorThreshold', 'TIMEOUT_ERROR_THRESHOLD', 25000],
  ['instrument', 'INSTRUMENT', true],
  ['filter'], // deprecated
  ['ff_captureFrame', 'FF_CAPTURE_FRAME', false]
]

var BOOL_OPTS = [
  'active',
  'captureExceptions',
  'filterHttpHeaders',
  'logBody',
  'timeout',
  'instrument',
  'ff_captureFrame'
]

var normalizeBool = function (bool) {
  if (!bool) return false
  switch (bool.toString().toLowerCase()) {
    case '0':
    case 'false':
    case 'no':
    case 'off':
    case 'disabled':
      return false
    default:
      return true
  }
}

module.exports = function (opts) {
  opts = opts || {}
  var result = {
    ignoreUrlStr: [],
    ignoreUrlRegExp: [],
    ignoreUserAgentStr: [],
    ignoreUserAgentRegExp: [],
    _apiHost: opts._apiHost || 'intake.opbeat.com',
    _apiPort: opts._apiPort,
    _apiSecure: opts._apiSecure
  }

  OPTS_MATRIX.forEach(function (opt) {
    var key = opt[0]
    var env, val

    if (opt[1]) env = 'OPBEAT_' + opt[1]

    if (key in opts) {
      val = opts[key]
    } else if (env && env in process.env) {
      val = process.env[env]
    } else if (typeof opt[2] === 'function') {
      val = opt[2](result)
    } else if (opt.length === 3) {
      val = opt[2]
    }

    if (~BOOL_OPTS.indexOf(key)) val = normalizeBool(val)
    if (val !== undefined) result[key] = val
  })

  if (opts.ignoreUrls) {
    opts.ignoreUrls.forEach(function (ptn) {
      if (typeof ptn === 'string') result.ignoreUrlStr.push(ptn)
      else result.ignoreUrlRegExp.push(ptn)
    })
  }
  if (opts.ignoreUserAgents) {
    opts.ignoreUserAgents.forEach(function (ptn) {
      if (typeof ptn === 'string') result.ignoreUserAgentStr.push(ptn)
      else result.ignoreUserAgentRegExp.push(ptn)
    })
  }

  return result
}
