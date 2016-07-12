'use strict'

var url = require('url')
var util = require('util')
var stringify = require('json-stringify-safe')
var stackman = require('stackman')()

exports._MAX_HTTP_BODY_CHARS = 2048 // expose for testing purposes

var mysqlErrorMsg = /(ER_[A-Z_]+): /

exports.parseMessage = function (message, data) {
  if (typeof message === 'object') {
    // if `captureError` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    if (message.message) {
      data.param_message = message.message
      message = util.format.apply(this, [message.message].concat(message.params))
    } else {
      message = util.inspect(message)
    }
  }

  data.message = message
}

exports.parseError = function (err, data, cb) {
  stackman(err, function (stack) {
    setMessage(data, err)
    setException(data, err)
    setStacktrace(data, stack.frames)
    setCulprit(data, stack.frames)
    setModule(data)
    setExtraProperties(data, stack.properties)
    cb(data)
  })
}

exports.parseRequest = function (req) {
  var protocol = req.socket.encrypted ? 'https' : 'http'
  var host = req.headers.host || '<no host>'
  var userAgent = req.headers['user-agent']
  var httpObj = {
    method: req.method,
    url: protocol + '://' + host + req.url,
    query_string: url.parse(req.url).query,
    headers: req.headers,
    secure: !!req.socket.encrypted,
    remote_host: req.socket.remoteAddress
  }

  var data = req.json || req.body || req.payload
  if (data !== undefined) {
    if (typeof data !== 'string') data = stringify(data)
    if (typeof data === 'string') data = data.slice(0, exports._MAX_HTTP_BODY_CHARS)
    httpObj.data = data
  }

  if (req.cookies) httpObj.cookies = req.cookies
  if (userAgent) httpObj.user_agent = userAgent
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

function setMessage (data, err) {
  // If the message have already been set, for instance when calling
  // `captureError` with a string or an object-literal, just return without
  // overwriting it
  if (data.message) return
  // TODO: Normally err.name is just "Error", maybe we should omit it in that case?
  data.message = err.name + ': ' + (err.message || '<no message>')
}

function setException (data, err) {
  var type = err.name

  // To provide better grouping of mysql errors that happens after the async
  // boundery, we modify to exception type to include the custom mysql error
  // type (e.g. ER_PARSE_ERROR)
  var match = (err.message || '').match(mysqlErrorMsg)
  if (match) type += ': ' + match[1]

  data.exception = {
    type: type,
    value: err.message
  }
}

function setStacktrace (data, frames) {
  if (!frames) return
  data.stacktrace = {
    frames: frames.map(exports.parseCallsite)
  }
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
function setCulprit (data, frames) {
  if (data.culprit) return // skip if user provided a custom culprit
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
  data.culprit = filename ? fnName + ' (' + filename + ')' : fnName
}

function setModule (data) {
  if (!data.stacktrace) return
  var frame = data.stacktrace.frames[0]
  if (!frame || frame.in_app) return
  var match = frame.filename.match(/node_modules\/([^\/]*)/)
  if (!match) return
  data.exception.module = match[1]
}

function setExtraProperties (data, properties) {
  var keys = Object.keys(properties || {})
  if (!keys.length) return
  data.extra = data.extra || {}

  // handle if user gives us stuff like { extra: 404 }
  if (typeof data.extra !== 'object') data.extra = { value: String(data.extra) }

  keys.forEach(function (key) {
    if (key in data.extra) return
    data.extra[key] = properties[key]
  })
}
