'use strict'

var util = require('util')
var url = require('url')

var afterAll = require('after-all-results')
var basicAuth = require('basic-auth')
var getUrlFromRequest = require('original-url')
var httpHeaders = require('http-headers')
var stringify = require('fast-safe-stringify')
var truncate = require('unicode-byte-truncate')

var stackman = require('./stackman')

exports._MAX_HTTP_BODY_CHARS = 2048 // expose for testing purposes

var mysqlErrorMsg = /(ER_[A-Z_]+): /

exports.parseMessage = function (msg) {
  var error = { log: {} }

  if (typeof msg === 'string') {
    error.log.message = msg
  } else if (typeof msg === 'object' && msg !== null) {
    // if `captureError` is passed an object instead of an error or a string we
    // expect it to be in the format of `{ message: '...', params: [] }` and it
    // will be used as `param_message`.
    if (msg.message) {
      error.log.message = util.format.apply(this, [msg.message].concat(msg.params))
      error.log.param_message = msg.message
    } else {
      error.log.message = util.inspect(msg)
    }
  } else {
    error.log.message = String(msg)
  }

  return error
}

exports.parseError = function (err, agent, cb) {
  stackman.callsites(err, function (_err, callsites) {
    if (_err) {
      agent.logger.debug('error while getting error callsites: %s', _err.message)
    }

    var errorMsg = String(err.message)
    var error = {
      exception: {
        message: errorMsg,
        type: String(err.name)
      }
    }

    if ('code' in err) {
      error.exception.code = String(err.code)
    } else {
      // To provide better grouping of mysql errors that happens after the async
      // boundery, we modify to exception type to include the custom mysql error
      // type (e.g. ER_PARSE_ERROR)
      var match = errorMsg.match(mysqlErrorMsg)
      if (match) error.exception.code = match[1]
    }

    var props = stackman.properties(err)
    if (props.code) delete props.code // we already have it directly on the exception
    if (Object.keys(props).length > 0) error.exception.attributes = props

    var next = afterAll(function (_, frames) {
      // As of now, parseCallsite suppresses errors internally, but even if
      // they were passed on, we would want to suppress them here anyway

      if (frames) {
        var culprit = getCulprit(frames)
        var module = getModule(frames)
        if (culprit) error.culprit = culprit // TODO: consider moving culprit to exception
        if (module) error.exception.module = module // TODO: consider if we should include this as it's not originally what module was intended for
        error.exception.stacktrace = frames
      }

      cb(null, error)
    })

    if (callsites) {
      for (const callsite of callsites) {
        exports.parseCallsite(callsite, true, agent, next())
      }
    }
  })
}

exports.getContextFromRequest = function (req, conf, type) {
  var captureBody = conf.captureBody === type || conf.captureBody === 'all'

  var context = {
    http_version: req.httpVersion,
    method: req.method,
    url: getUrlFromRequest(req),
    socket: {
      remote_address: req.socket.remoteAddress,
      encrypted: !!req.socket.encrypted
    },
    headers: undefined
  }

  if (conf.captureHeaders) {
    context.headers = Object.assign({}, req.headers)
  }

  var contentLength = parseInt(req.headers['content-length'], 10)
  var transferEncoding = req.headers['transfer-encoding']
  var chunked = typeof transferEncoding === 'string' && transferEncoding.toLowerCase() === 'chunked'
  var body = req.json || req.body || req.payload
  var haveBody = body && (chunked || contentLength > 0)

  if (haveBody) {
    if (captureBody) {
      if (typeof body !== 'string') {
        body = tryJsonStringify(body) || stringify(body)
      }
      if (body.length > exports._MAX_HTTP_BODY_CHARS) {
        body = truncate(body, exports._MAX_HTTP_BODY_CHARS)
      }
      context.body = body
    } else {
      context.body = '[REDACTED]'
    }
  }

  // TODO: Tempoary fix for https://github.com/elastic/apm-agent-nodejs/issues/813
  if (context.url && context.url.port) {
    context.url.port = String(context.url.port)
  }

  return context
}

exports.getContextFromResponse = function (res, conf, isError) {
  var context = {
    status_code: res.statusCode,
    headers: undefined
  }

  if (conf.captureHeaders) {
    context.headers = res.headers || httpHeaders(res, true)
  }

  if (isError) {
    context.headers_sent = res.headersSent
    context.finished = res.finished
  }

  return context
}

exports.getUserContextFromRequest = function (req) {
  var user = req.user || basicAuth(req) || req.session
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

exports.parseCallsite = function (callsite, isError, agent, cb) {
  var conf = agent._conf
  var filename = callsite.getFileName()
  var frame = {
    filename: callsite.getRelativeFileName() || '',
    lineno: callsite.getLineNumber(),
    function: callsite.getFunctionNameSanitized(),
    library_frame: !callsite.isApp()
  }
  if (!Number.isFinite(frame.lineno)) frame.lineno = 0 // this should be an int, but sometimes it's not?! ¯\_(ツ)_/¯
  if (filename) frame.abs_path = filename

  var lines = isError
    ? (callsite.isApp() ? conf.sourceLinesErrorAppFrames : conf.sourceLinesErrorLibraryFrames)
    : (callsite.isApp() ? conf.sourceLinesSpanAppFrames : conf.sourceLinesSpanLibraryFrames)

  if (lines === 0 || callsite.isNode()) {
    setImmediate(cb, null, frame)
    return
  }

  callsite.sourceContext(lines, function (err, context) {
    if (err) {
      agent.logger.debug('error while getting callsite source context: %s', err.message)
    } else {
      frame.pre_context = context.pre
      frame.context_line = context.line
      frame.post_context = context.post
    }

    cb(null, frame)
  })
}

exports.parseUrl = function (urlStr) {
  return new url.URL(urlStr, 'relative:///')
}

// Default `culprit` to the top of the stack or the highest non `library_frame`
// frame if such exists
function getCulprit (frames) {
  if (frames.length === 0) return

  var filename = frames[0].filename
  var fnName = frames[0].function
  for (var n = 0; n < frames.length; n++) {
    if (!frames[n].library_frame) {
      filename = frames[n].filename
      fnName = frames[n].function
      break
    }
  }

  return filename ? fnName + ' (' + filename + ')' : fnName
}

function getModule (frames) {
  if (frames.length === 0) return
  var frame = frames[0]
  if (!frame.library_frame) return
  var match = frame.filename.match(/node_modules\/([^/]*)/)
  if (!match) return
  return match[1]
}

function tryJsonStringify (obj) {
  try {
    return JSON.stringify(obj)
  } catch (e) {}
}
