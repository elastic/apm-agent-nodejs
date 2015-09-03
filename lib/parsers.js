'use strict'

var url = require('url')
var util = require('util')
var stackman = require('stackman')()
var stringify = require('json-stringify-safe')

exports.parseMessage = function (message, opts) {
  if (typeof message === 'object') {
    // if `captureError` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    if (message.message) {
      opts.param_message = message.message
      message = util.format.apply(this, [message.message].concat(message.params))
    } else {
      message = util.inspect(message)
    }
  }

  opts.message = message
}

exports.parseError = function (err, opts, cb) {
  stackman(err, function (stack) {
    setMessage(opts, err)
    setException(opts, err)
    setStacktrace(opts, stack.frames)
    setCulprit(opts, stack.frames)
    setModule(opts)
    setExtraProperties(opts, stack.properties)
    cb(opts)
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
    secure: req.socket.encrypted,
    remote_host: req.socket.remoteAddress,
    data: req.json || req.body || '<unavailable: use bodyParser middleware>'
  }
  if (typeof httpObj.data !== 'string') httpObj.data = stringify(httpObj.data)
  if (req.cookies) httpObj.cookies = req.cookies
  if (userAgent) httpObj.user_agent = userAgent
  return httpObj
}

function setMessage (opts, err) {
  // If the message have already been set, for instance when calling
  // `captureError` with a string or an object-literal, just return without
  // overwriting it
  if (opts.message) return
  // TODO: Normally err.name is just "Error", maybe we should omit it in that case?
  opts.message = err.name + ': ' + (err.message || '<no message>')
}

function setException (opts, err) {
  opts.exception = {
    type: err.name,
    value: err.message
  }
}

function setStacktrace (opts, frames) {
  opts.stacktrace = {
    frames: frames.map(function (callsite) {
      var filename = callsite.getFileName()
      var frame = {
        filename: callsite.getRelativeFileName() || '',
        lineno: callsite.getLineNumber(),
        'function': callsite.getFunctionNameSanitized(),
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
    })
  }
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
function setCulprit (opts, frames) {
  if (opts.culprit) return // skip if user provided a custom culprit
  if (!frames.length) return
  var filename = frames[0].getRelativeFileName()
  var fnName = frames[0].getFunctionNameSanitized()
  for (var n = 0, l = frames.length; n < l; n++) {
    if (frames[n].in_app) {
      filename = frames[n].getRelativeFileName()
      fnName = frames[n].getFunctionNameSanitized()
      break
    }
  }
  opts.culprit = filename ? fnName + ' (' + filename + ')' : fnName
}

function setModule (opts) {
  var frame = opts.stacktrace.frames[0]
  if (!frame || frame.in_app) return
  var match = frame.filename.match(/node_modules\/([^\/]*)/)
  if (!match) return
  opts.exception.module = match[1]
}

function setExtraProperties (opts, properties) {
  var keys = Object.keys(properties || {})
  if (!keys.length) return
  opts.extra = opts.extra || {}

  // handle if user gives us stuff like { extra: 404 }
  if (typeof opts.extra !== 'object') opts.extra = { value: String(opts.extra) }

  keys.forEach(function (key) {
    if (key in opts.extra) return
    opts.extra[key] = properties[key]
  })
}
