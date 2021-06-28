'use strict'

var http = require('http')
var path = require('path')

var isError = require('core-util-is').isError
var Filters = require('object-filter-sequence')

var config = require('./config')
var connect = require('./middleware/connect')
const constants = require('./constants')
var errors = require('./errors')
var Instrumentation = require('./instrumentation')
var lambda = require('./lambda')
var Metrics = require('./metrics')
var parsers = require('./parsers')
var symbols = require('./symbols')
const { frameCacheStats } = require('./stacktraces')

var IncomingMessage = http.IncomingMessage
var ServerResponse = http.ServerResponse

var version = require('../package').version

module.exports = Agent

function Agent () {
  this.middleware = { connect: connect.bind(this) }

  this.logger = null
  this._conf = null
  this._httpClient = null
  this._uncaughtExceptionListener = null

  // Early configuration to ensure `agent.logger` works before `.start()`
  // is called.
  this._config()

  this._instrumentation = new Instrumentation(this)
  this._metrics = new Metrics(this)
  this._errorFilters = new Filters()
  this._transactionFilters = new Filters()
  this._spanFilters = new Filters()
  this._transport = null

  this.lambda = lambda(this)
}

Object.defineProperty(Agent.prototype, 'currentTransaction', {
  get () {
    return this._instrumentation.currentTransaction
  }
})

Object.defineProperty(Agent.prototype, 'currentSpan', {
  get () {
    return this._instrumentation.currentSpan
  }
})

Object.defineProperty(Agent.prototype, 'currentTraceparent', {
  get () {
    const current = this.currentSpan || this.currentTransaction
    return current ? current.traceparent : null
  }
})

Object.defineProperty(Agent.prototype, 'currentTraceIds', {
  get () {
    return this._instrumentation.ids
  }
})

Agent.prototype.destroy = function () {
  if (this._transport) this._transport.destroy()
}

// These are metrics about the agent itself -- separate from the metrics
// gathered on behalf of the using app and sent to APM server. Currently these
// are only useful for internal debugging of the APM agent itself.
//
// **These stats are NOT a promised interface.**
Agent.prototype._getStats = function () {
  const stats = {
    frameCache: frameCacheStats
  }
  if (typeof this._transport._getStats === 'function') {
    stats.apmclient = this._transport._getStats()
  }
  return stats
}

Agent.prototype.addPatch = function (modules, handler) {
  return this._instrumentation.addPatch.apply(this._instrumentation, arguments)
}

Agent.prototype.removePatch = function (modules, handler) {
  return this._instrumentation.removePatch.apply(this._instrumentation, arguments)
}

Agent.prototype.clearPatches = function (modules) {
  return this._instrumentation.clearPatches.apply(this._instrumentation, arguments)
}

Agent.prototype.startTransaction = function (name, type, subtype, action, { startTime, childOf } = {}) {
  return this._instrumentation.startTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.endTransaction = function (result, endTime) {
  return this._instrumentation.endTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.setTransactionName = function (name) {
  return this._instrumentation.setTransactionName.apply(this._instrumentation, arguments)
}

/**
 * Sets outcome value for current transaction
 *
 * The setOutcome method allows users to override the default
 * outcome handling in the agent and set their own value.
 *
 * @param {string} outcome must be one of `failure`, `success`, or `unknown`
 */
Agent.prototype.setTransactionOutcome = function (outcome) {
  return this._instrumentation.setTransactionOutcome.apply(this._instrumentation, arguments)
}

Agent.prototype.startSpan = function (name, type, subtype, action, { childOf } = {}) {
  return this._instrumentation.startSpan.apply(this._instrumentation, arguments)
}

/**
 * Sets outcome value for current active span
 *
 * The setOutcome method allows users to override the default
 * outcome handling in the agent and set their own value.
 *
 * @param {string} outcome must be one of `failure`, `success`, or `unknown`
 */
Agent.prototype.setSpanOutcome = function (outcome) {
  return this._instrumentation.setSpanOutcome.apply(this._instrumentation, arguments)
}

Agent.prototype._config = function (opts) {
  this._conf = config(opts)
  this.logger = this._conf.logger

  const { host, port, protocol } = this._conf.serverUrl
    ? parsers.parseUrl(this._conf.serverUrl)
    : { host: 'localhost:8200', port: '8200' }

  this._conf.serverHost = host
  this._conf.serverPort = port === ''
    ? (protocol === 'https:' ? 443 : 80)
    : parseInt(port, 10)
}

Agent.prototype.isStarted = function () {
  return global[symbols.agentInitialized]
}

Agent.prototype.start = function (opts) {
  if (this.isStarted()) throw new Error('Do not call .start() more than once')
  global[symbols.agentInitialized] = true

  this._config(opts)

  if (this._conf.filterHttpHeaders) {
    this.addFilter(require('./filters/http-headers'))
  }

  if (!this._conf.active) {
    this.logger.debug('Elastic APM agent disabled (`active` is false)')
    return this
  } else if (!this._conf.serviceName) {
    this.logger.error('Elastic APM isn\'t correctly configured: Missing serviceName')
    this._conf.active = false
    return this
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(this._conf.serviceName)) {
    this.logger.error('Elastic APM isn\'t correctly configured: serviceName "%s" contains invalid characters! (allowed: a-z, A-Z, 0-9, _, -, <space>)', this._conf.serviceName)
    this._conf.active = false
    return this
  } else if (!(this._conf.serverPort >= 1 && this._conf.serverPort <= 65535)) {
    this.logger.error('Elastic APM isn\'t correctly configured: serverUrl "%s" contains an invalid port! (allowed: 1-65535)', this._conf.serverUrl)
    this._conf.active = false
    return this
  } else if (this._conf.logLevel === 'trace') {
    var stackObj = {}
    Error.captureStackTrace(stackObj)

    // Attempt to load package.json from process.argv.
    var pkg = null
    try {
      var basedir = path.dirname(process.argv[1] || '.')
      pkg = require(path.join(basedir, 'package.json'))
    } catch (e) {}

    this.logger.trace({
      pid: process.pid,
      ppid: process.ppid,
      arch: process.arch,
      platform: process.platform,
      node: process.version,
      agent: version,
      startTrace: stackObj.stack.split(/\n */).slice(1),
      main: pkg ? pkg.main : '<could not determine>',
      dependencies: pkg ? pkg.dependencies : '<could not determine>',
      conf: this._conf.toJSON()
    }, 'agent configured correctly')
  }

  this._transport = this._conf.transport(this._conf, this)

  this._instrumentation.start()
  this._metrics.start()

  Error.stackTraceLimit = this._conf.stackTraceLimit
  if (this._conf.captureExceptions) this.handleUncaughtExceptions()

  return this
}

Agent.prototype.getServiceName = function () {
  return this._conf.serviceName
}

Agent.prototype.setFramework = function ({ name, version, overwrite = true }) {
  if (!this._transport || !this._conf) return
  const conf = {}
  if (name && (overwrite || !this._conf.frameworkName)) this._conf.frameworkName = conf.frameworkName = name
  if (version && (overwrite || !this._conf.frameworkVersion)) this._conf.frameworkVersion = conf.frameworkVersion = version
  this._transport.config(conf)
}

Agent.prototype.setUserContext = function (context) {
  var trans = this.currentTransaction
  if (!trans) return false
  trans.setUserContext(context)
  return true
}

Agent.prototype.setCustomContext = function (context) {
  var trans = this.currentTransaction
  if (!trans) return false
  trans.setCustomContext(context)
  return true
}

Agent.prototype.setLabel = function (key, value, stringify) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.setLabel(key, value, stringify)
}

Agent.prototype.addLabels = function (labels, stringify) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.addLabels(labels, stringify)
}

Agent.prototype.addFilter = function (fn) {
  this.addErrorFilter(fn)
  this.addTransactionFilter(fn)
  this.addSpanFilter(fn)
  // Note: This does *not* add to *metadata* filters, partly for backward
  // compat -- the structure of metadata objects is quite different and could
  // break existing filters -- and partly because that different structure
  // means it makes less sense to re-use the same function to filter them.
}

Agent.prototype.addErrorFilter = function (fn) {
  if (typeof fn !== 'function') {
    this.logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._errorFilters.push(fn)
}

Agent.prototype.addTransactionFilter = function (fn) {
  if (typeof fn !== 'function') {
    this.logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._transactionFilters.push(fn)
}

Agent.prototype.addSpanFilter = function (fn) {
  if (typeof fn !== 'function') {
    this.logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._spanFilters.push(fn)
}

Agent.prototype.addMetadataFilter = function (fn) {
  if (typeof fn !== 'function') {
    this.logger.error('Can\'t add filter of type %s', typeof fn)
    return
  } else if (!this._transport) {
    this.logger.error('cannot add metadata filter to inactive or unconfigured agent (agent has no transport)')
    return
  } else if (typeof this._transport.addMetadataFilter !== 'function') {
    // Graceful failure if unexpectedly using a too-old APM client.
    this.logger.error('cannot add metadata filter: transport does not support addMetadataFilter')
    return
  }

  // Metadata filters are handled by the APM client, where metadata is
  // processed.
  this._transport.addMetadataFilter(fn)
}

const EMPTY_OPTS = {}

// Capture an APM server "error" event for the given `err` and send it to APM
// server.
//
// Usage:
//    captureError(err, opts, cb)
//    captureError(err, opts)
//    captureError(err, cb)
//
// where:
// - `err` is an Error instance, or a string message, or a "parameterized string
//   message" object, e.g.:
//      {
//        message: "this is my message template: %d %s"},
//        params: [ 42, "another param" ]
//      }
// - `opts` can include any of the following (all optional):
//   - `opts.timestamp` - Milliseconds since the Unix epoch. Defaults to now.
//   - `opts.user` - Object to add to `error.context.user`.
//   - `opts.tags` - Deprecated, use `opts.labels`. Object to add to
//     `error.context.labels`.
//   - `opts.labels` - Object to add to `error.context.labels`.
//   - `opts.custom` - Object to add to `error.context.custom`.
//   - `opts.message` - If `err` is an Error instance, this string is added to
//     `error.log.message` (unless it matches err.message).
//   - `opts.request` - HTTP request (node `IncomingMessage` instance) to use
//     for `error.context.request`.
//   - `opts.response` - HTTP response (node `ServerResponse` instance) to use
//     for `error.context.response`.
//   - `opts.handled` - Boolean indicating if this exception was handled by
//     application code.
//   - `opts.captureAttributes` - Boolean. Default true. Set to false to *not*
//     include properties of `err` as attributes on the APM error event.
//   - `opts.skipOutcome` - Boolean. Default false. Set to true to not have
//     this captured error set `<currentSpan>.outcome = failure`.
// - `cb` is a callback `function (captureErr, apmErrorIdString)`
Agent.prototype.captureError = function (err, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = EMPTY_OPTS
  } else if (!opts) {
    opts = EMPTY_OPTS
  }

  // Quick out if disableSend=true, no point in the processing time.
  if (this._conf.disableSend) {
    if (cb) {
      process.nextTick(cb, null, errors.generateErrorId())
    }
    return
  }

  const agent = this
  let callSiteLoc = null
  const errIsError = isError(err)
  const handled = opts.handled !== false // default true
  const shouldCaptureAttributes = opts.captureAttributes !== false // default true
  const skipOutcome = Boolean(opts.skipOutcome)
  const span = this.currentSpan
  const timestampUs = (opts.timestamp
    ? Math.floor(opts.timestamp * 1000)
    : Date.now() * 1000)
  const trans = this.currentTransaction
  const traceContext = (span || trans || {})._context

  // As an added feature, for *some* cases, we capture a stacktrace at the point
  // this `captureError` was called. This is added to `error.log.stacktrace`.
  if (handled &&
      (agent._conf.captureErrorLogStackTraces === config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS ||
       (!errIsError && agent._conf.captureErrorLogStackTraces === config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES))
  ) {
    callSiteLoc = {}
    Error.captureStackTrace(callSiteLoc, Agent.prototype.captureError)
  }

  if (span && !skipOutcome) {
    span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
  }

  // Move the remaining captureError processing to a later tick because:
  // 1. This allows the calling code to continue processing. For example, for
  //    Express instrumentation this can significantly improve latency in
  //    the app's endpoints because the response does not proceed until the
  //    error handlers return.
  // 2. Gathering `error.context.response` in the same tick results in data
  //    for a response that hasn't yet completed (no headers, unset status_code,
  //    etc.).
  setImmediate(() => {
    // Gather `error.context.*`.
    const req = (opts.request instanceof IncomingMessage
      ? opts.request
      : trans && trans.req)
    const res = (opts.response instanceof ServerResponse
      ? opts.response
      : trans && trans.res)
    const errorContext = {
      user: Object.assign(
        {},
        req && parsers.getUserContextFromRequest(req),
        trans && trans._user,
        opts.user
      ),
      tags: Object.assign(
        {},
        trans && trans._labels,
        opts.tags,
        opts.labels
      ),
      custom: Object.assign(
        {},
        trans && trans._custom,
        opts.custom
      )
    }
    if (req) {
      errorContext.request = parsers.getContextFromRequest(req, agent._conf, 'errors')
    }
    if (res) {
      errorContext.response = parsers.getContextFromResponse(res, agent._conf, true)
    }

    errors.createAPMError({
      log: agent.logger,
      exception: errIsError ? err : null,
      logMessage: errIsError ? null : err,
      shouldCaptureAttributes,
      timestampUs,
      handled,
      callSiteLoc,
      message: opts.message,
      sourceLinesAppFrames: agent._conf.sourceLinesErrorAppFrames,
      sourceLinesLibraryFrames: agent._conf.sourceLinesErrorLibraryFrames,
      trans,
      traceContext,
      errorContext
    }, function filterAndSendError (_err, apmError) {
      // _err is always null from createAPMError.
      const id = apmError.id

      apmError = agent._errorFilters.process(apmError)
      if (!apmError) {
        agent.logger.debug('error ignored by filter %o', { id })
        if (cb) {
          cb(null, id)
        }
        return
      }

      if (agent._transport) {
        agent.logger.info('Sending error to Elastic APM: %o', { id })
        agent._transport.sendError(apmError, function () {
          agent.flush(function (flushErr) {
            if (cb) {
              cb(flushErr, id)
            }
          })
        })
      } else if (cb) {
        // TODO: Swallow this error just as it's done in agent.flush()?
        cb(new Error('cannot capture error before agent is started'), id)
      }
    })
  })
}

// The optional callback will be called with the error object after the error
// have been sent to the intake API. If no callback have been provided we will
// automatically terminate the process, so if you provide a callback you must
// remember to terminate the process manually.
Agent.prototype.handleUncaughtExceptions = function (cb) {
  var agent = this

  if (this._uncaughtExceptionListener) {
    process.removeListener('uncaughtException', this._uncaughtExceptionListener)
  }

  this._uncaughtExceptionListener = function (err) {
    agent.logger.debug({ err }, 'Elastic APM caught unhandled exception')
    // The stack trace of uncaught exceptions are normally written to STDERR.
    // The `uncaughtException` listener inhibits this behavor, and it's
    // therefore necessary to manually do this to not break expectations.
    if (agent._conf.logUncaughtExceptions === true) {
      console.error(err)
    }

    agent.captureError(err, { handled: false }, function () {
      cb ? cb(err) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Agent.prototype.flush = function (cb) {
  if (this._transport) {
    // TODO: Only bind the callback if the transport can't use AsyncResource from async hooks
    this._transport.flush(cb && this._instrumentation.bindFunction(cb))
  } else {
    // Log an *err* to provide a stack for the user.
    const err = new Error('cannot flush agent before it is started')
    this.logger.warn({ err }, err.message)
    if (cb) process.nextTick(cb)
  }
}

Agent.prototype.registerMetric = function (name, labelsOrCallback, callback) {
  var labels
  if (typeof labelsOrCallback === 'function') {
    callback = labelsOrCallback
  } else {
    labels = labelsOrCallback
  }

  if (typeof callback !== 'function') {
    this.logger.error('Can\'t add callback of type %s', typeof callback)
    return
  }

  this._metrics.getOrCreateGauge(name, callback, labels)
}
