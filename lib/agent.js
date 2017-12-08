'use strict'

var IncomingMessage = require('http').IncomingMessage
var ServerResponse = require('http').ServerResponse
var parseUrl = require('url').parse
var uuid = require('uuid')
var ElasticAPMHttpClient = require('elastic-apm-http-client')
var objectAssign = require('object-assign')
var afterAll = require('after-all-results')
var isError = require('core-util-is').isError
var debug = require('debug')('elastic-apm')
var config = require('./config')
var logger = require('./logger')
var Filters = require('./filters')
var parsers = require('./parsers')
var request = require('./request')
var stackman = require('./stackman')
var connect = require('./middleware/connect')
var Instrumentation = require('./instrumentation')

var version = require('../package').version
var userAgent = 'elastic-apm-node/' + version

module.exports = Agent

function Agent () {
  var boundConnect = connect.bind(this)
  this.middleware = { connect: boundConnect, express: boundConnect }

  this._instrumentation = new Instrumentation(this)
  this._filters = new Filters()
  this._platform = {}

  this._config()
}

Agent.prototype.startTransaction = function () {
  return this._instrumentation.startTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.endTransaction = function () {
  return this._instrumentation.endTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.setTransactionName = function () {
  return this._instrumentation.setTransactionName.apply(this._instrumentation, arguments)
}

Agent.prototype.buildSpan = function () {
  return this._instrumentation.buildSpan.apply(this._instrumentation, arguments)
}

Agent.prototype._config = function (opts) {
  opts = config(opts)

  logger.init({ level: opts.logLevel })

  // TODO: Make as much private as possible
  this.serviceName = opts.serviceName
  this.secretToken = opts.secretToken
  this.serverUrl = opts.serverUrl
  this.validateServerCert = opts.validateServerCert
  this.serviceVersion = opts.serviceVersion
  this.active = opts.active
  this.logLevel = opts.logLevel
  this.hostname = opts.hostname
  this.stackTraceLimit = opts.stackTraceLimit
  this.captureExceptions = opts.captureExceptions
  this.captureSpanStackTraces = opts.captureSpanStackTraces
  this.abortedRequests = {
    active: opts.errorOnAbortedRequests,
    errorThreshold: opts.abortedErrorThreshold
  }
  this.instrument = opts.instrument
  this._serverHost = this.serverUrl ? parseUrl(this.serverUrl).hostname : 'localhost'
  this._logBody = opts.logBody
  this._flushInterval = opts.flushInterval
  this._maxQueueSize = opts.maxQueueSize
  this._ignoreUrlStr = opts.ignoreUrlStr
  this._ignoreUrlRegExp = opts.ignoreUrlRegExp
  this._ignoreUserAgentStr = opts.ignoreUserAgentStr
  this._ignoreUserAgentRegExp = opts.ignoreUserAgentRegExp
  this.ff_captureFrame = opts.ff_captureFrame
  this.sourceContext = opts.sourceContext

  return opts
}

Agent.prototype.start = function (opts) {
  if (global._elastic_apm_initialized) throw new Error('Do not call .start() more than once')
  global._elastic_apm_initialized = true

  opts = this._config(opts)

  this._filters.config(opts)

  if (!this.active) {
    logger.info('Elastic APM agent is inactive due to configuration')
    return this
  } else if (!this.serviceName) {
    logger.error('Elastic APM isn\'t correctly configured: Missing serviceName')
    this.active = false
    return this
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(this.serviceName)) {
    logger.error('Elastic APM isn\'t correctly configured: serviceName "%s" contains invalid characters! (allowed: a-z, A-Z, 0-9, _, -, <space>)', this.serviceName)
    this.active = false
    return this
  } else {
    debug('agent configured correctly %o', { node: process.version, agent: version, service: this.serviceName, instrument: this.instrument })
  }

  this._instrumentation.start()

  this._httpClient = new ElasticAPMHttpClient({
    secretToken: this.secretToken,
    userAgent: userAgent,
    serverUrl: this.serverUrl,
    rejectUnauthorized: this.validateServerCert
  })

  Error.stackTraceLimit = this.stackTraceLimit
  if (this.captureExceptions) this.handleUncaughtExceptions()

  return this
}

Agent.prototype.setUserContext = function (context) {
  var trans = this._instrumentation.currentTransaction
  if (!trans) return false
  trans.setUserContext(context)
  return true
}

Agent.prototype.setCustomContext = function (context) {
  var trans = this._instrumentation.currentTransaction
  if (!trans) return false
  trans.setCustomContext(context)
  return true
}

Agent.prototype.setTag = function (key, value) {
  var trans = this._instrumentation.currentTransaction
  if (!trans) return false
  return trans.setTag(key, value)
}

Agent.prototype.addFilter = function (fn) {
  if (typeof fn !== 'function') {
    logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._filters.add(fn)
}

Agent.prototype.captureError = function (err, opts, cb) {
  if (typeof opts === 'function') return this.captureError(err, null, opts)

  var agent = this
  var trans = this._instrumentation.currentTransaction
  var timestamp = new Date().toISOString()
  var id = uuid.v4()
  var req = opts && opts.request instanceof IncomingMessage
    ? opts.request
    : trans && trans.req
  var res = opts && opts.response instanceof ServerResponse
    ? opts.response
    : trans && trans.res

  // TODO: Make ff_captureFrame into a proper config option
  if (this.ff_captureFrame && !(opts && opts.uncaught)) {
    // TODO: Use a more performance optimal approach to capture the frames
    var captureFrameError = new Error()
  }

  if (!isError(err)) {
    prepareError(parsers.parseMessage(err))
  } else {
    parsers.parseError(err, agent, function (_, error) {
      // As of now, parseError suppresses errors internally, but even if they
      // were passed on, we would want to suppress them here anyway
      prepareError(error)
    })
  }

  function prepareError (error) {
    error.id = id
    error.timestamp = timestamp
    error.context = {
      user: objectAssign(
        {},
        req && parsers.getUserContextFromRequest(req),
        trans && trans._user,
        opts && opts.user
      ),
      tags: objectAssign(
        {},
        trans && trans._tags,
        opts && opts.tags
      ),
      custom: objectAssign(
        {},
        trans && trans._custom,
        opts && opts.custom
      )
    }

    if (opts && opts.uncaught && error.exception) {
      error.exception.uncaught = true
    }

    if (req) {
      error.context.request = parsers.getContextFromRequest(req, agent._logBody)
    }

    if (res) {
      error.context.response = parsers.getContextFromResponse(res, true)
    }

    if (captureFrameError) {
      // prepare to add a top frame to the stack trace specifying the location
      // where captureError was called from. This can make it easier to debug
      // async stack traces.
      stackman.callsites(captureFrameError, function (_err, callsites) {
        if (_err) {
          debug('error while getting capture frame callsites: %s', _err.message)
        }

        var next = afterAll(function (_, frames) {
          // As of now, parseCallsite suppresses errors internally, but even if
          // they were passed on, we would want to suppress them here anyway

          if (frames) {
            frames.shift() // ignore the first frame as it will be this module
            error.log.stacktrace = frames
          }

          send(error)
        })

        if (callsites) {
          callsites.forEach(function (callsite) {
            parsers.parseCallsite(callsite, agent, next())
          })
        }
      })
    } else {
      send(error)
    }
  }

  function send (error) {
    logger.info('logging error %s with Elastic APM', id)
    request.errors(agent, [error], cb)
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
    debug('Elastic APM caught unhandled exception: %s', err.message)
    agent.captureError(err, {uncaught: true}, function () {
      cb ? cb(err) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}
