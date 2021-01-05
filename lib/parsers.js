'use strict'

var util = require('util')
var url = require('url')
var path = require('path')

var afterAll = require('after-all-results')
var basicAuth = require('basic-auth')
var getUrlFromRequest = require('original-url')
var httpHeaders = require('http-headers')
var stringify = require('fast-safe-stringify')
var truncate = require('unicode-byte-truncate')
var stacktrace = require('error-stack-parser')

var stackman = require('./stackman')

const _MAX_HTTP_BODY_CHARS = 2048

const {
  redactKeysFromObject,
  redactKeysFromPostedFormVariables
} = require('./filters/sanitize-field-names')

var mysqlErrorMsg = /(ER_[A-Z_]+): /

function parseMessage (msg) {
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

function parseStackTrace (err) {
  // graphqljs adds the `originalError` property which represents the original
  // error thrown within the resolver
  err = err.originalError || err
  if (err.stack == null) {
    return []
  }
  return stacktrace.parse(err).map((frame) => {
    const filename = frame.getFileName() || ''
    return {
      abs_path: filename,
      filename: getRelativeFileName(filename),
      function: frame.getFunctionName(),
      lineno: frame.getLineNumber(),
      library_frame: !isApp(frame)
    }
  })
}

// `parseError` starts the serialization of the given Error instance into the
// object to be sent to the APM server.
//
// APM error fields filled in are `error.exception` and `error.culprit`.
//
// By default, some properties on the given `err` (according to
// https://github.com/watson/stackman/tree/master/#var-properties--stackmanpropertieserr)
// are added to `error.exception.attributes`, unless overridden by
// `captureAttributes === false`.
// TODO: Consider changing this default to false in v4.0.0.
function parseError (err, captureAttributes, agent, cb) {
  captureAttributes = captureAttributes !== false

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

    if (captureAttributes) {
      var props = stackman.properties(err)
      if (props.code) delete props.code // we already have it directly on the exception
      if (Object.keys(props).length > 0) error.exception.attributes = props
    }

    var next = afterAll(function (_, frames) {
      // As of now, parseCallsite suppresses errors internally, but even if
      // they were passed on, we would want to suppress them here anyway

      if (frames.length === 0) {
        // If we are not able to extract callsite information from the error, then
        // we fallback to parsing the error manually
        try {
          frames = parseStackTrace(err)
        } catch (parseErr) {
          agent.logger.debug('error parsing the stack: %s', parseErr.message)
        }
      }
      var culprit = getCulprit(frames)
      var moduleName = _moduleNameFromFrames(frames)
      if (culprit) error.culprit = culprit // TODO: consider moving culprit to exception
      if (module) error.exception.module = moduleName // TODO: consider if we should include this as it's not originally what module was intended for
      error.exception.stacktrace = frames
      cb(null, error)
    })

    if (callsites) {
      for (const callsite of callsites) {
        parseCallsite(callsite, true, agent, next())
      }
    }
  })
}

function getContextFromRequest (req, conf, type) {
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
    context.headers = redactKeysFromObject(
      Object.assign({}, req.headers),
      conf.sanitizeFieldNamesRegExp
    )
  }

  var contentLength = parseInt(req.headers['content-length'], 10)
  var transferEncoding = req.headers['transfer-encoding']
  var chunked = typeof transferEncoding === 'string' && transferEncoding.toLowerCase() === 'chunked'
  var body = req.json || req.body || req.payload
  var haveBody = body && (chunked || contentLength > 0)

  if (haveBody) {
    if (!captureBody) {
      context.body = '[REDACTED]'
    } else if (Buffer.isBuffer(body)) {
      context.body = '<Buffer>'
    } else {
      body = redactKeysFromPostedFormVariables(body, req.headers, conf.sanitizeFieldNamesRegExp)

      if (typeof body !== 'string') {
        body = tryJsonStringify(body) || stringify(body)
      }
      if (body.length > _MAX_HTTP_BODY_CHARS) {
        body = truncate(body, _MAX_HTTP_BODY_CHARS)
      }
      context.body = body
    }
  }

  // TODO: Tempoary fix for https://github.com/elastic/apm-agent-nodejs/issues/813
  if (context.url && context.url.port) {
    context.url.port = String(context.url.port)
  }

  return context
}

function getContextFromResponse (res, conf, isError) {
  var context = {
    status_code: res.statusCode,
    headers: undefined
  }

  if (conf.captureHeaders) {
    context.headers = res.headers || httpHeaders(res, true)
    context.headers = redactKeysFromObject(context.headers, conf.sanitizeFieldNamesRegExp)
  }

  if (isError) {
    context.headers_sent = res.headersSent
    context.finished = res.finished
  }

  return context
}

function getUserContextFromRequest (req) {
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

function parseCallsite (callsite, isError, agent, cb) {
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

function parseUrl (urlStr) {
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

// Infer the node.js module name from the top frame filename, if possible.
// Here `frames` is a data structure as returned by `parseStackTrace`.
//
// Examples:
//    node_modules/mymodule/index.js
//                 ^^^^^^^^
//    node_modules/@myorg/mymodule/index.js
//                 ^^^^^^^^^^^^^^^
// or on Windows:
//    node_modules\@myorg\mymodule\lib\subpath\index.js
//                 ^^^^^^^^^^^^^^^
let SEP = path.sep
if (SEP === '\\') {
  SEP = '\\' + SEP // Escape this for use in a regex.
}
const MODULE_NAME_REGEX = new RegExp(`node_modules${SEP}([^${SEP}]*)(${SEP}([^${SEP}]*))?`)
function _moduleNameFromFrames (frames) {
  if (frames.length === 0) return
  var frame = frames[0]
  if (!frame.library_frame) return
  var match = frame.filename.match(MODULE_NAME_REGEX)
  if (!match) return
  var moduleName = match[1]
  if (moduleName && moduleName[0] === '@' && match[3]) {
    // Normalize the module name separator to '/', even on Windows.
    moduleName += '/' + match[3]
  }
  return moduleName
}

function tryJsonStringify (obj) {
  try {
    return JSON.stringify(obj)
  } catch (e) {}
}

function getRelativeFileName (filename) {
  var root = process.cwd()
  if (root[root.length - 1] !== path.sep) root += path.sep
  return !~filename.indexOf(root) ? filename : filename.substr(root.length)
}

// stackframe argument resembles structured stack trace of v8 https://v8.dev/docs/stack-trace-api
function isApp (stackframe) {
  return !isNode(stackframe) && !~(stackframe.getFileName() || '').indexOf('node_modules' + path.sep)
}

// stackframe argument resembles structured stack trace of v8 https://v8.dev/docs/stack-trace-api
function isNode (stackframe) {
  if (stackframe.isNative) return true
  var filename = stackframe.getFileName() || ''
  return (!path.isAbsolute(filename) && filename[0] !== '.')
}

module.exports = {
  getContextFromRequest,
  getContextFromResponse,
  getUserContextFromRequest,
  parseCallsite,
  parseError,
  parseMessage,
  parseUrl,

  // Expose for testing purposes.
  _MAX_HTTP_BODY_CHARS,
  _moduleNameFromFrames
}
