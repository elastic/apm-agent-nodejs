'use strict'

// Handling for translating `<Error instance>.stack` to the
// `error.exception.stacktrace` data passed to APM server.
// https://github.com/elastic/apm-server/blob/master/docs/spec/v2/error.json#L633
//
// A lot of this derived from https://github.com/watson/stackman but was
// moved internal to allow breaking compat for perf work.

var fs = require('fs')
var path = require('path')

const asyncCache = require('async-cache')
const afterAllResults = require('after-all-results')
const errorCallsites = require('error-callsites')
const errorStackParser = require('error-stack-parser')
const loadSourceMap = require('load-source-map')

const fileCache = asyncCache({
  max: 500, // fileCacheMax
  load: function (file, cb) {
    fs.readFile(file, { encoding: 'utf8' }, function (err, data) {
      if (err) {
        cb(err)
        return
      }
      cb(null, data.split(/\r?\n/))
    })
  }
})

const sourceMapCache = asyncCache({
  max: 100, // sourceMapCacheMax
  load: function (filename, cb) {
    loadSourceMap(filename, function onSourceMap (err, sourcemap) {
      // Translate sourcemap===undefined to null, because 'async-cache'
      // treats `undefined` as a cache miss. Without this there is no
      // caching for files that have no sourcemap (the common case).
      cb(err, sourcemap || null)
    })
  }
})

// ---- internal support functions

// If gathering a stacktrace from the structured CallSites fails, this is
// used as a fallback: parsing the `err.stack` *string*.
function stackTraceFromErrStackString (log, err) {
  const stacktrace = []

  // graphqljs adds the `originalError` property which represents the original
  // error thrown within the resolver
  err = err.originalError || err

  if (err.stack === null) {
    return []
  }

  // frames is an array of StackFrame (https://github.com/stacktracejs/stackframe).
  let frames = null
  try {
    frames = errorStackParser.parse(err)
  } catch (parseErr) {
    log.debug('could not parse err.stack string: %s', parseErr)
  }

  if (frames) {
    for (var i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const filename = frame.getFileName() || ''
      stacktrace.push({
        abs_path: filename,
        filename: getRelativeFileName(filename), // XXX relTo arg! Use cwd cache?
        function: frame.getFunctionName(),
        lineno: frame.getLineNumber(),
        // XXX isApp: will isCallsiteApp work for "StackFrame" class?  TODO: test case for this path
        library_frame: !isApp(frame)
      })
    }
  }

  return stacktrace
}

function isValidCallsites (callsites) {
  return Array.isArray(callsites) &&
    callsites.length > 0 &&
    typeof callsites[0] === 'object' &&
    typeof callsites[0].getFileName === 'function'
}


// XXX REVIEW-NOTE: This adds leading path.sep to allow a "foonode_modules", unlikely tho that is.
const NODE_MODULES_PATH_SEG = path.sep + 'node_modules' + path.sep
function isCallsiteApp (callsite) {
  if (isCallsiteNode(callsite)) {
    return false
  } else {
    const fileName = callsite.getFileName()
    if (!fileName) {
      return true
    } else if (fileName.indexOf(NODE_MODULES_PATH_SEG) === -1) {
      return true
    } else {
      return false
    }
  }
}

function isCallsiteNode (callsite) {
  if (callsite.isNative()) {
    return true
  } else {
    const fileName = callsite.getFileName()
    if (!fileName) {
      return true
    } else {
      return (!path.isAbsolute(fileName) && fileName[0] !== '.')
    }
  }
}

// From stackman getTypeNameSafely().
function getCallSiteTypeNameSafely (callsite) {
  try {
    return callsite.getTypeName()
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return null
  }
}

// From stackman getFunctionNameSanitized().
function getCallSiteFunctionNameSanitized (callsite) {
  var fnName = callsite.getFunctionName()
  if (fnName) return fnName
  var typeName = getCallSiteTypeNameSafely(callsite)
  if (typeName) return typeName + '.' + (callsite.getMethodName() || '<anonymous>')
  return '<anonymous>'
}

function addSourceContextToFrame (frame, lines, lineNum, n) {
  var index = lineNum - 1 // lines 1-based -> index 0-based
  var nBefore = Math.ceil((n - 1) / 2)
  var nAfter = Math.floor((n - 1) / 2)
  frame.pre_context = lines.slice(Math.max(0, index - nBefore), index)
  frame.context_line = lines[index]
  frame.post_context = lines.slice(index + 1, index + 1 + nAfter)
}

// Get the path of `filename` relative to `relTo` -- which should be a directory
// path *without* a trailing path separator.
function getRelativeFileName (filename, relTo) {
  if (filename.startsWith(relTo + path.sep)) {
    return filename.slice(relTo.length + 1)
  } else {
    return filename
  }
}

// Put together an APM stacktrace frame object:
//     {
//       "filename": "...",
//       "lineno": 65,
//       "function": "...",
//       "library_frame": <bool>,
//       "abs_path": "...",
//       "pre_context": [ ... ],
//       "context_line": "...",
//       "post_context": [ ... ],
//     },
// from a v8 CallSite object
// (https://v8.dev/docs/stack-trace-api#customizing-stack-traces).
//
// This calls back with `cb(null, frame)` -- the first err arg is always null.
function frameFromCallSite (log, callsite, cwd, sourceLinesAppFrames, sourceLinesLibraryFrames, cb) {
  // XXX PERF microoptimizations: profile each of these `callsite.get*()`. Some may be surprisingly slow?
  // XXX PERF These three could be faster by avoiding getFileName multiple times.
  const filename = callsite.getFileName()
  const isApp = isCallsiteApp(callsite)
  const isNode = isCallsiteNode(callsite)
  const frame = {
    filename: filename ? getRelativeFileName(filename, cwd) : '',
    lineno: callsite.getLineNumber(),
    function: getCallSiteFunctionNameSanitized(callsite),
    library_frame: !isApp
  }
  if (!Number.isFinite(frame.lineno)) {
    // This should be an int, but sometimes it's not?! ¯\_(ツ)_/¯
    frame.lineno = 0
  }
  if (filename) {
    frame.abs_path = filename
  }

  // Finish early if we do not need to collect source lines of context.
  var linesOfContext = (isApp ? sourceLinesAppFrames : sourceLinesLibraryFrames)
  if (linesOfContext === 0 || isNode || !filename) {
    setImmediate(cb, null, frame)
    return
  }

  // To add source lines of context to the frame:
  // - First, use a sourcemap if available.
  sourceMapCache.get(filename, function (sourceMapErr, sourceMapConsumer) {
    let source

    if (sourceMapErr) {
      log.debug({ filename: filename, err: sourceMapErr },
        'could not process file source map for source context')
    } else if (sourceMapConsumer) {
      source = sourceMapConsumer.sourceContentFor(filename, true)
      console.warn('XXX have from sourceMap source: ', source.length)
      // console.warn('XXX lines: ', lines.length)
      // console.warn('XXX linesOfContext: ', linesOfContext)
      // XXX addContextToFrame from this.
      // console.warn('XXX frame: ', frame)
      cb(null, frame)
    }

    if (!source) {
      // - Second, fallback to file on disk if available.
      fileCache.get(filename, function onFileCacheGet (fileErr, lines) {
        if (fileErr) {
          log.debug({ filename: filename, err: fileErr },
            'could not read file for source context')
        } else {
          addSourceContextToFrame(frame, lines, callsite.getLineNumber(), linesOfContext)
        }
        cb(null, frame)
      })
    }
  })
}

// ---- exports

// Gather an APM `stacktrace` object from the given `err`.
// This stacktrace object is used for `error.exception.stacktrace`,
// `error.log.stacktrace`, or `span.stacktrace`.
//
// This is a best effort, so it never fails. It will log.debug any parsing
// failures.
//
// @param {Logger} log
// @param {Error|Object} err - Typically an Error instance, but can also be a
//    plain object on which `Error.captureStackTrace(...)` has been called.
// @param {Integer} sourceLinesAppFrames - The number of source lines of
//    context to include for frames in application code.
// @param {Integer} sourceLinesLibraryFrames - The number of source lines of
//    context to include for frames in library code (i.e. under node_modules/)
// @param {Function} filterCallSite - Optional. A function to filter the
//    CallSites to include in the stacktrace.
// @param {Function} cb - `cb(null, stacktrace)`
function gatherStackTrace (log, err, sourceLinesAppFrames, sourceLinesLibraryFrames, filterCallSite, cb) {
  // errorCallsites returns an array of v8 CallSite objects.
  // https://v8.dev/docs/stack-trace-api#customizing-stack-traces
  let callsites = errorCallsites(err)

  const next = afterAllResults(function finish (_err, stacktrace) {
    // _err is always null from frameFromCallSite.

    // If we are not able to extract callsite information from err, then
    // fallback to parsing the err.stack string.
    if (stacktrace.length === 0) {
      stacktrace = stackTraceFromErrStackString(log, err)
    }

    cb(null, stacktrace)
  })

  if (!isValidCallsites(callsites)) {
    // When can this happen? Another competing Error.prepareStackTrace breaking
    // error-callsites?
    log.debug('could not get valid callsites from error "%s"', err)
  } else if (callsites) {
    if (filterCallSite) {
      callsites = callsites.filter(filterCallSite)
    }
    const cwd = process.cwd() // XXX cache this?
    for (let i = 0; i < callsites.length; i++) {
      frameFromCallSite(
        log,
        callsites[i],
        cwd,
        sourceLinesAppFrames,
        sourceLinesLibraryFrames,
        next()
      )
    }
  }
}

module.exports = {
  gatherStackTrace
}
