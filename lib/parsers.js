'use strict'

var url = require('url')
var util = require('util')
var stringify = require('fast-safe-stringify')
var objectAssign = require('object-assign')
var afterAll = require('after-all-results')
var cookie = require('cookie')
var debug = require('debug')('opbeat')
var stackman = require('./stackman')

exports._MAX_HTTP_BODY_CHARS = 2048 // expose for testing purposes

var mysqlErrorMsg = /(ER_[A-Z_]+): /

exports.parseMessage = function (message, payload) {
  if (typeof message === 'object' && message !== null) {
    // if `captureError` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    if (message.message) {
      payload.param_message = message.message
      message = util.format.apply(this, [message.message].concat(message.params))
    } else {
      message = util.inspect(message)
    }
  }

  payload.message = message
}

exports.parseError = function (err, payload, cb) {
  stackman.callsites(err, function (_err, callsites) {
    if (_err) {
      debug('error while getting error callsites: %s', _err.message)
    }

    setMessage(payload, err)
    setException(payload, err)
    setExtraProperties(payload, stackman.properties(err))

    var next = afterAll(function (_, frames) {
      // As of now, parseCallsite suppresses errors internally, but even if
      // they were passed on, we would want to suppress them here anyway
      processFrames(payload, frames)
      cb(payload)
    })

    if (callsites) {
      callsites.forEach(function (callsite) {
        exports.parseCallsite(callsite, next())
      })
    }
  })
}

exports.getHTTPContextFromRequest = function (req, opts) {
  if (!opts) opts = {}

  var protocol = req.socket.encrypted ? 'https' : 'http'
  var host = req.headers.host || '<no host>'
  var path = req.originalUrl || req.url
  var context = {
    method: req.method,
    url: protocol + '://' + host + path,
    query_string: url.parse(path).query,
    headers: objectAssign({}, req.headers),
    secure: !!req.socket.encrypted,
    remote_host: req.socket.remoteAddress
  }

  if (req.headers['user-agent']) context.user_agent = req.headers['user-agent']

  if (typeof context.headers.cookie === 'string') {
    context.cookies = cookie.parse(context.headers.cookie)
    delete context.headers.cookie
  }

  var contentLength = parseInt(req.headers['content-length'], 10)
  var transferEncoding = req.headers['transfer-encoding']
  var chunked = typeof transferEncoding === 'string' && transferEncoding.toLowerCase() === 'chunked'
  var body = req.json || req.body || req.payload
  var haveBody = body && (chunked || contentLength > 0)

  if (haveBody) {
    if (opts.body) {
      var bodyStr = typeof body === 'string' ? body : stringify(body)
      if (bodyStr.length > exports._MAX_HTTP_BODY_CHARS) {
        body = bodyStr.slice(0, exports._MAX_HTTP_BODY_CHARS)
      }
      context.data = body
    } else {
      context.data = '[REDACTED]'
    }
  }

  return context
}

exports.getUserContextFromRequest = function (req) {
  var user = req.user || (req.auth && req.auth.credentials) || req.session
  if (!user) return

  var context = {}

  if (typeof user.authenticated === 'boolean') {
    context.is_authenticated = user.authenticated
  }

  if (typeof user.id === 'string' || typeof user.id === 'number') {
    context.id = user.id
  } else if (typeof user._id === 'string' || typeof user._id === 'number') {
    context.id = user._id
  }

  if (typeof user.username === 'string') {
    context.username = user.username
  } else if (typeof user.name === 'string') {
    context.username = user.name
  }

  if (typeof user.email === 'string') {
    context.email = user.email
  }

  return context
}

exports.parseCallsite = function (callsite, cb) {
  var filename = callsite.getFileName()
  var frame = {
    filename: callsite.getRelativeFileName() || '',
    lineno: callsite.getLineNumber(),
    function: callsite.getFunctionNameSanitized(),
    in_app: callsite.isApp()
  }
  if (!Number.isFinite(frame.lineno)) frame.lineno = 0 // this should be an int, but sometimes it's not?!
  if (filename) frame.abs_path = filename

  callsite.sourceContext(function (err, context) {
    if (err) {
      debug('error while getting callsite source context: %s', err.message)
    } else {
      frame.pre_context = context.pre
      frame.context_line = context.line
      frame.post_context = context.post
    }

    cb(null, frame)
  })
}

function setMessage (payload, err) {
  // If the message have already been set, for instance when calling
  // `captureError` with a string or an object-literal, just return without
  // overwriting it
  if (payload.message) return
  // TODO: Normally err.name is just "Error", maybe we should omit it in that case?
  payload.message = err.name + ': ' + (err.message || '<no message>')
}

function setException (payload, err) {
  var type = err.name

  // Force `err.message` to a string because we've seen a case where it for
  // some reason wasn't (even though `err` was a proper Error object). See
  // https://github.com/opbeat/opbeat-node/issues/130 for details.
  var msg = String(err.message)

  // To provide better grouping of mysql errors that happens after the async
  // boundery, we modify to exception type to include the custom mysql error
  // type (e.g. ER_PARSE_ERROR)
  var match = msg.match(mysqlErrorMsg)
  if (match) type += ': ' + match[1]

  payload.exception = {
    type: type,
    value: msg
  }
}

function processFrames (payload, frames) {
  if (!frames || frames.length === 0) return

  payload.stacktrace = {frames: frames}

  setCulprit(payload)
  setModule(payload)
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if
// such exists
function setCulprit (payload) {
  if (payload.culprit) return // skip if user provided a custom culprit
  var frames = payload.stacktrace.frames
  var filename = frames[0].filename
  var fnName = frames[0].function
  for (var n = 0; n < frames.length; n++) {
    if (frames[n].in_app) {
      filename = frames[n].filename
      fnName = frames[n].function
      break
    }
  }
  payload.culprit = filename ? fnName + ' (' + filename + ')' : fnName
}

function setModule (payload) {
  if (!payload.stacktrace) return
  var frame = payload.stacktrace.frames[0]
  if (frame.in_app) return
  var match = frame.filename.match(/node_modules\/([^/]*)/)
  if (!match) return
  payload.exception.module = match[1]
}

function setExtraProperties (payload, properties) {
  var keys = Object.keys(properties || {})
  if (!keys.length) return
  payload.extra = payload.extra || {}

  // handle if user gives us stuff like { extra: 404 }
  if (typeof payload.extra !== 'object') payload.extra = { value: String(payload.extra) }

  keys.forEach(function (key) {
    if (key in payload.extra) return
    payload.extra[key] = properties[key]
  })
}
