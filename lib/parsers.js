'use strict'

var url = require('url')
var util = require('util')
var stringify = require('json-stringify-safe')
var objectAssign = require('object-assign')
var cookie = require('cookie')
var redact = require('redact-secrets')('[REDACTED]')
var stackman = require('stackman')()

exports._MAX_HTTP_BODY_CHARS = 2048 // expose for testing purposes

var mysqlErrorMsg = /(ER_[A-Z_]+): /

exports.parseMessage = function (message, payload) {
  if (typeof message === 'object') {
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
  stackman(err, function (stack) {
    setMessage(payload, err)
    setException(payload, err)
    setStacktrace(payload, stack.frames)
    setCulprit(payload, stack.frames)
    setModule(payload)
    setExtraProperties(payload, stack.properties)
    cb(payload)
  })
}

exports.parseRequest = function (req, opts) {
  if (!opts) opts = {}

  var protocol = req.socket.encrypted ? 'https' : 'http'
  var host = req.headers.host || '<no host>'
  var path = req.originalUrl || req.url
  var httpObj = {
    method: req.method,
    url: protocol + '://' + host + path,
    query_string: url.parse(path).query,
    headers: objectAssign({}, req.headers),
    secure: !!req.socket.encrypted,
    remote_host: req.socket.remoteAddress
  }

  if (req.headers['user-agent']) httpObj.user_agent = req.headers['user-agent']

  if (typeof httpObj.headers.cookie === 'string') {
    httpObj.cookies = redact.map(cookie.parse(httpObj.headers.cookie))
    delete httpObj.headers.cookie
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
      httpObj.data = body
    } else {
      httpObj.data = '[REDACTED]'
    }
  }

  return httpObj
}

exports.parseCallsite = function (callsite) {
  var filename = callsite.getFileName()
  var frame = {
    filename: callsite.getRelativeFileName() || '',
    lineno: callsite.getLineNumber(),
    function: callsite.getFunctionNameSanitized(),
    in_app: callsite.isApp()
  }
  if (!Number.isFinite(frame.lineno)) frame.lineno = 0 // this should be an int, but sometimes it's not?!
  if (filename) frame.abs_path = filename

  if ('context' in callsite) {
    frame.pre_context = callsite.context.pre
    frame.context_line = callsite.context.line
    frame.post_context = callsite.context.post
  }

  return frame
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

  // To provide better grouping of mysql errors that happens after the async
  // boundery, we modify to exception type to include the custom mysql error
  // type (e.g. ER_PARSE_ERROR)
  var match = (err.message || '').match(mysqlErrorMsg)
  if (match) type += ': ' + match[1]

  payload.exception = {
    type: type,
    value: err.message
  }
}

function setStacktrace (payload, frames) {
  if (!frames) return
  payload.stacktrace = {
    frames: frames.map(exports.parseCallsite)
  }
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
function setCulprit (payload, frames) {
  if (payload.culprit) return // skip if user provided a custom culprit
  if (!frames || !frames.length) return
  var filename = frames[0].getRelativeFileName()
  var fnName = frames[0].getFunctionNameSanitized()
  for (var n = 0, l = frames.length; n < l; n++) {
    if (frames[n].in_app) {
      filename = frames[n].getRelativeFileName()
      fnName = frames[n].getFunctionNameSanitized()
      break
    }
  }
  payload.culprit = filename ? fnName + ' (' + filename + ')' : fnName
}

function setModule (payload) {
  if (!payload.stacktrace) return
  var frame = payload.stacktrace.frames[0]
  if (!frame || frame.in_app) return
  var match = frame.filename.match(/node_modules\/([^\/]*)/)
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
