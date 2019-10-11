'use strict'

var crypto = require('crypto')
var http = require('http')
var path = require('path')

var afterAll = require('after-all-results')
var isError = require('core-util-is').isError
var ancestors = require('require-ancestors')
var Filters = require('object-filter-sequence')

var config = require('./config')
var connect = require('./middleware/connect')
var Instrumentation = require('./instrumentation')
var lambda = require('./lambda')
var Metrics = require('./metrics')
var parsers = require('./parsers')
var stackman = require('./stackman')
var symbols = require('./symbols')

var IncomingMessage = http.IncomingMessage
var ServerResponse = http.ServerResponse

var version = require('../package').version

module.exports = Agent

function Agent () {
  this.middleware = { connect: connect.bind(this) }

  this._conf = null
  this._httpClient = null
  this._uncaughtExceptionListener = null

  this._config()

  this._instrumentation = new Instrumentation(this)
  this._metrics = new Metrics(this)
  this._errorFilters = new Filters()
  this._transactionFilters = new Filters()
  this._spanFilters = new Filters()
  this._transport = null

  this.lambda = lambda(this)
}

Object.defineProperty(Agent.prototype, 'logger', {
  get () {
    return this._conf.logger
  }
})

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

Agent.prototype.startSpan = function (name, type, subtype, action, { childOf } = {}) {
  return this._instrumentation.startSpan.apply(this._instrumentation, arguments)
}

Agent.prototype._config = function (opts) {
  this._conf = config(opts)

  const { host, port } = this._conf.serverUrl
    ? parsers.parseUrl(this._conf.serverUrl)
    : { host: 'localhost:8200', port: '8200' }

  this._conf.serverHost = host
  this._conf.serverPort = parseInt(port, 10)
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
  } else if (this._conf.serverPort < 1 || this._conf.serverPort > 65535) {
    this.logger.error('Elastic APM isn\'t correctly configured: serverUrl "%s" contains an invalid port! (allowed: 1-65535)', this._conf.serverUrl)
    this._conf.active = false
    return this
  } else if (this._conf.logLevel === 'trace') {
    var _ancestors = ancestors(module)
    var basedir = path.dirname(process.argv[1])
    var stackObj = {}
    Error.captureStackTrace(stackObj)

    try {
      var pkg = require(path.join(basedir, 'package.json'))
    } catch (e) {}

    this.logger.trace('agent configured correctly %o', {
      pid: process.pid,
      ppid: process.ppid,
      arch: process.arch,
      platform: process.platform,
      node: process.version,
      agent: version,
      ancestors: _ancestors,
      startTrace: stackObj.stack.split(/\n */).slice(1),
      main: pkg && pkg.main,
      dependencies: pkg && pkg.dependencies,
      conf: this._conf
    })
  }

  this._transport = this._conf.transport(this._conf, this)

  this._instrumentation.start()
  this._metrics.start()

  Error.stackTraceLimit = this._conf.stackTraceLimit
  if (this._conf.captureExceptions) this.handleUncaughtExceptions()

  return this
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

Agent.prototype.setLabel = function (key, value) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.setLabel(key, value)
}

Agent.prototype.addLabels = function (labels) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.addLabels(labels)
}

Agent.prototype.addFilter = function (fn) {
  this.addErrorFilter(fn)
  this.addTransactionFilter(fn)
  this.addSpanFilter(fn)
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

Agent.prototype.captureError = function (err, opts, cb) {
  if (typeof opts === 'function') return this.captureError(err, null, opts)

  var agent = this
  var trans = this.currentTransaction
  var span = this.currentSpan
  var timestamp = normalizeTimestamp(opts && opts.timestamp)
  var context = (span || trans || {})._context || {}
  var req = opts && opts.request instanceof IncomingMessage
    ? opts.request
    : trans && trans.req
  var res = opts && opts.response instanceof ServerResponse
    ? opts.response
    : trans && trans.res
  var _isError = isError(err)

  if ((!opts || opts.handled !== false) &&
      (agent._conf.captureErrorLogStackTraces === config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS ||
       (!_isError && agent._conf.captureErrorLogStackTraces === config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES))
  ) {
    var captureLocation = {}
    Error.captureStackTrace(captureLocation, Agent.prototype.captureError)
  }

  if (!_isError) {
    prepareError(parsers.parseMessage(err))
  } else {
    parsers.parseError(err, agent, function (_, error) {
      // As of now, parseError suppresses errors internally, but even if they
      // were passed on, we would want to suppress them here anyway
      prepareError(error)
    })
  }

  function prepareError (error) {
    error.id = crypto.randomBytes(16).toString('hex')
    error.parent_id = context.id
    error.trace_id = context.traceId
    error.timestamp = timestamp
    error.context = {
      user: Object.assign(
        {},
        req && parsers.getUserContextFromRequest(req),
        trans && trans._user,
        opts && opts.user
      ),
      tags: Object.assign(
        {},
        trans && trans._labels,
        opts && opts.tags,
        opts && opts.labels
      ),
      custom: Object.assign(
        {},
        trans && trans._custom,
        opts && opts.custom
      )
    }

    if (trans) {
      error.transaction_id = trans.id
      error.transaction = {
        type: trans.type,
        sampled: trans.sampled
      }
    }

    if (error.exception) {
      error.exception.handled = !opts || opts.handled

      // Optional add an alternative error message as well as the exception message
      if (opts && opts.message && opts.message !== error.exception.message && !error.log) {
        error.log = { message: opts.message }
      }
    }

    if (req) {
      error.context.request = parsers.getContextFromRequest(req, agent._conf, 'errors')
    }

    if (res) {
      error.context.response = parsers.getContextFromResponse(res, agent._conf, true)
    }

    if (captureLocation) {
      // prepare to add a stack trace pointing to where captureError was called
      // from. This can make it easier to debug async stack traces.
      stackman.callsites(captureLocation, function (err, callsites) {
        if (err) {
          agent.logger.debug('error while getting capture location callsites: %s', err.message)
        }

        var next = afterAll(function (_, frames) {
          // As of now, parseCallsite suppresses errors internally, but even if
          // they were passed on, we would want to suppress them here anyway

          if (frames) {
            // In case there isn't any log object, we'll make a dummy message
            // as the APM Server requires a message to be present if a
            // stacktrace also present
            if (!error.log) error.log = { message: error.exception.message }
            error.log.stacktrace = frames
          }

          send(error)
        })

        if (callsites) {
          for (const callsite of callsites) {
            parsers.parseCallsite(callsite, true, agent, next())
          }
        }
      })
    } else {
      send(error)
    }
  }

  function send (error) {
    const id = error.id

    error = agent._errorFilters.process(error)

    if (!error) {
      agent.logger.debug('error ignored by filter %o', { id })
      if (cb) cb(null, id)
      return
    }

    if (agent._transport) {
      agent.logger.info('Sending error to Elastic APM', { id })
      agent._transport.sendError(error, function () {
        agent.flush(function (err) {
          if (cb) cb(err, id)
        })
      })
    } else if (cb) {
      // TODO: Swallow this error just as it's done in agent.flush()?
      process.nextTick(cb.bind(null, new Error('cannot capture error before agent is started'), id))
    }
  }
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
    // The stack trace of uncaught exceptions are normally written to STDERR.
    // The `uncaughtException` listener inhibits this behavor, and it's
    // therefore necessary to manually do this to not break expectations.
    if (agent._conf.logUncaughtExceptions === true) console.error(err)

    agent.logger.debug('Elastic APM caught unhandled exception: %s', err.message)

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
    this.logger.warn(new Error('cannot flush agent before it is started'))
    if (cb) process.nextTick(cb)
  }
}

function normalizeTimestamp (timestamp) {
  return (timestamp > 0 && Math.floor(timestamp * 1000)) || Date.now() * 1000
}
