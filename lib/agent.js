'use strict'

var http = require('http')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var uuid = require('node-uuid')
var OpbeatHttpClient = require('opbeat-http-client')
var ReleaseTracker = require('opbeat-release-tracker')
var debug = require('debug')('opbeat')
var config = require('./config')
var logger = require('./logger')
var filters = require('./filters')
var parsers = require('./parsers')
var request = require('./request')
var connect = require('./middleware/connect')
var Instrumentation = require('./instrumentation')

var version = require('../package').version
var userAgent = 'opbeat-nodejs/' + version
var warnedAboutFilter = false

var noop = function () {}

module.exports = Agent

function Agent () {
  EventEmitter.call(this)

  var boundConnect = connect.bind(this)
  this.middleware = { connect: boundConnect, express: boundConnect }

  this._instrumentation = new Instrumentation(this)
  this._filters = []
  this._platform = {}

  // configure the agent with default values
  this._config()
}

util.inherits(Agent, EventEmitter)

Agent.prototype.startTransaction = function () {
  return this._instrumentation.startTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.endTransaction = function () {
  return this._instrumentation.endTransaction.apply(this._instrumentation, arguments)
}

Agent.prototype.setTransactionName = function () {
  return this._instrumentation.setTransactionName.apply(this._instrumentation, arguments)
}

Agent.prototype.buildTrace = function () {
  return this._instrumentation.buildTrace.apply(this._instrumentation, arguments)
}

Agent.prototype._config = function (opts) {
  opts = config(opts)

  logger.init({ level: opts.logLevel })

  this.appId = opts.appId
  this.organizationId = opts.organizationId
  this.secretToken = opts.secretToken
  this.active = opts.active
  this.logLevel = opts.logLevel
  this.hostname = opts.hostname
  this.stackTraceLimit = opts.stackTraceLimit
  this.captureExceptions = opts.captureExceptions
  this.exceptionLogLevel = opts.exceptionLogLevel
  this.timeout = {
    active: opts.timeout,
    errorThreshold: opts.timeoutErrorThreshold
  }
  this.instrument = opts.instrument
  this._logBody = opts.logBody
  this._ignoreUrlStr = opts.ignoreUrlStr
  this._ignoreUrlRegExp = opts.ignoreUrlRegExp
  this._ignoreUserAgentStr = opts.ignoreUserAgentStr
  this._ignoreUserAgentRegExp = opts.ignoreUserAgentRegExp
  this.filter = opts.filter // deprecated
  this.ff_captureFrame = opts.ff_captureFrame
  this._apiHost = opts._apiHost
  this._apiPort = opts._apiPort
  this._apiSecure = opts._apiSecure

  if (this.filter) {
    warnedAboutFilter = true
    logger.warn('Opbeat `filter` option is deprecated. See `opbeat.addFilter()` instead.')
  }

  return opts
}

Agent.prototype.start = function (opts) {
  if (global.__opbeat_initialized) throw new Error('Do not call opbeat.start() more than once')
  global.__opbeat_initialized = true

  opts = this._config(opts)

  if (opts.filterHttpHeaders) this.addFilter(filters.httpHeaders)

  if (!this.active) {
    logger.info('Opbeat agent is inactive due to configuration')
    return this
  } else if (!this.appId || !this.organizationId || !this.secretToken) {
    logger.error('Opbeat isn\'t correctly configured: Missing organizationId, appId or secretToken')
    this.active = false
    return this
  } else {
    debug('agent configured correctly %o', { node: process.version, agent: version, org: this.organizationId, app: this.appId, instrument: this.instrument })
  }

  this._instrumentation.start()

  this._httpClient = OpbeatHttpClient({
    appId: this.appId,
    organizationId: this.organizationId,
    secretToken: this.secretToken,
    userAgent: userAgent,
    _apiHost: this._apiHost,
    _apiPort: this._apiPort,
    _apiSecure: this._apiSecure
  })

  Error.stackTraceLimit = this.stackTraceLimit
  if (this.captureExceptions) this.handleUncaughtExceptions()

  this.on('error', errorLogger)
  this.on('logged', function (url, uuid) {
    logger.info('Opbeat logged error successfully at %s', url, { uuid: uuid })
  })

  return this
}

Agent.prototype.addFilter = function (fn) {
  if (typeof fn !== 'function') {
    logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._filters.push(fn)
}

Agent.prototype._runFilters = function (payload, err) {
  // deprecated functionality
  if (this.filter) {
    if (!warnedAboutFilter) {
      warnedAboutFilter = true
      logger.warn('Opbeat `filter` option is deprecated. See `opbeat.addFilter()` instead.')
    }
    payload = this.filter(err, payload)
    if (!payload) return
  }

  // abort if a filter function doesn't return an object
  this._filters.some(function (filter) {
    payload = filter(payload)
    return !payload
  })

  return payload
}

Agent.prototype.captureError = function (err, payload, cb) {
  var agent = this
  var captureTime = new Date()

  if (typeof payload === 'function') {
    cb = payload
    payload = {}
  } else if (!payload) {
    payload = {}
  } else if (payload.request instanceof http.IncomingMessage) {
    payload.http = parsers.parseRequest(payload.request, {body: this._logBody})
  }
  delete payload.request

  var trans = this._instrumentation.currentTransaction
  if (!payload.http && trans && trans.req) payload.http = parsers.parseRequest(trans.req, {body: this._logBody})

  var errUUID = payload.extra && payload.extra.uuid || uuid.v4()

  if (!util.isError(err)) {
    var isMessage = true
    var customCulprit = 'culprit' in payload
    parsers.parseMessage(err, payload)
    logger.error(payload.message, { uuid: errUUID })
    err = new Error(payload.message)
  } else if (this.ff_captureFrame && !err.uncaught) {
    var captureFrameError = new Error()
  }

  if (!isMessage) {
    logger.error('logging error with Opbeat:', { uuid: errUUID })
    logger.error(err.stack)
  }

  parsers.parseError(err, payload, function (payload) {
    if (isMessage) {
      // Messages shouldn't have an exception and the algorithm for finding the
      // culprit might show the Opbeat agent and we don't want that
      delete payload.exception
      if (!customCulprit) delete payload.culprit
      if (payload.stacktrace) payload.stacktrace.frames.shift()
    }

    var done = function () {
      if (payload.stacktrace) payload.stacktrace.frames.reverse() // opbeat expects frames in reverse order
      payload.machine = { hostname: agent.hostname }
      payload.extra = payload.extra || {}
      payload.extra.node = process.version
      if (!payload.extra.uuid) payload.extra.uuid = errUUID
      payload.timestamp = captureTime.toISOString()

      payload = agent._runFilters(payload, err)
      if (!payload) logger.info('Error not sent to Opbeat - Ignored by filter')

      if (payload && agent.active) request.error(agent, payload, cb)
      // In v3.x, the captureError callback will only be called if the agent is
      // active. This is scheduled to change in v4.x. When using the middleware
      // we want to call the next function even if the agent is inactive, so
      // until we release v4.x we need a way to tell the captureError function
      // that the callback should be called even if the agent is inactive. This
      // is done by naming the callback `_opbeatMiddleware`.
      // TODO: Undo this hack in v4.x
      else if (cb && cb.name === '_opbeatMiddleware') cb()
    }

    if (captureFrameError && (!payload.stacktrace || !payload.stacktrace.frames.some(function (frame) { return frame.in_app }))) {
      // prepare to add a top frame to the stack trace specifying the location
      // where captureError was called from. This can make it easier to debug
      // async stack traces.
      parsers.parseError(captureFrameError, {}, function (result) {
        // ignore the first frame as it will be the opbeat module
        if (result.stacktrace) var frame = result.stacktrace.frames[1]
        if (payload.stacktrace) payload.stacktrace.frames.unshift(frame)
        else if (frame) payload.stacktrace = { frames: [frame] }
        done()
      })
    } else {
      done()
    }
  })
}

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Agent.prototype.handleUncaughtExceptions = function (cb) {
  var agent = this

  if (this._uncaughtExceptionListener) process.removeListener('uncaughtException', this._uncaughtExceptionListener)

  this._uncaughtExceptionListener = function (err) {
    var payload = {
      extra: { uuid: uuid.v4() },
      level: agent.exceptionLogLevel
    }

    debug('Opbeat caught unhandled exception %o', { uuid: payload.extra.uuid })

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    agent.removeAllListeners()
    // But make sure emitted errors doesn't cause yet another uncaught
    // exception
    agent.on('error', errorLogger)

    err.uncaught = true

    agent.captureError(err, payload, function (opbeatErr, url) {
      if (opbeatErr) {
        logger.error('Could not notify Opbeat', { uuid: payload.extra.uuid })
        logger.error(opbeatErr.stack)
      } else {
        logger.info('Opbeat logged error successfully at %s', url, { uuid: payload.extra.uuid })
      }
      cb ? cb(err, url) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Agent.prototype.trackRelease = function (opts, cb) {
  if (!this._releaseTracker) this._releaseTracker = ReleaseTracker(this._httpClient)
  this._releaseTracker(opts, cb || noop)
}

function errorLogger (err, uuid) {
  logger.error('Could not notify Opbeat', { uuid: uuid })
  logger.error(err.stack)
}
