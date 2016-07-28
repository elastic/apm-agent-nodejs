'use strict'

var http = require('http')
var util = require('util')
var events = require('events')
var uuid = require('node-uuid')
var OpbeatHttpClient = require('opbeat-http-client')
var ReleaseTracker = require('opbeat-release-tracker')
var debug = require('debug')('opbeat')
var config = require('./config')
var logger = require('./logger')
var parsers = require('./parsers')
var request = require('./request')
var connect = require('./middleware/connect')
var Instrumentation = require('./instrumentation')

var version = require('../package').version
var userAgent = 'opbeat-nodejs/' + version

var noop = function () {}

module.exports = Agent

function Agent () {
  events.EventEmitter.call(this)

  var boundConnect = connect.bind(this)
  this.middleware = { connect: boundConnect, express: boundConnect }

  var ins = new Instrumentation(this)
  this._instrumentation = ins
  this.startTransaction = ins.startTransaction.bind(ins)
  this.endTransaction = ins.endTransaction.bind(ins)
  this.setTransactionName = ins.setTransactionName.bind(ins)
  this.buildTrace = ins.buildTrace.bind(ins)

  // configure the agent with default values
  this._init()
}

util.inherits(Agent, events.EventEmitter)

Agent.prototype._init = function (opts) {
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
    errorResult: opts.timeoutErrorResult,
    errorThreshold: opts.timeoutErrorThreshold
  }
  this.instrument = opts.instrument
  this.filter = opts.filter
  this.ff_captureFrame = opts.ff_captureFrame
  this._apiHost = opts._apiHost
}

Agent.prototype.start = function (opts) {
  if (global.__opbeat_initialized) throw new Error('Do not call opbeat.start() more than once')
  global.__opbeat_initialized = true

  this._init(opts)

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
    _apiHost: this._apiHost
  })

  Error.stackTraceLimit = this.stackTraceLimit
  if (this.captureExceptions) this.handleUncaughtExceptions()

  this.on('error', errorLogger)
  this.on('logged', function (url, uuid) {
    logger.info('Opbeat logged error successfully at %s', url, { uuid: uuid })
  })

  return this
}

Agent.prototype.captureError = function (err, data, cb) {
  var agent = this
  var captureTime = new Date()

  if (typeof data === 'function') {
    cb = data
    data = {}
  } else if (!data) {
    data = {}
  } else if (data.request instanceof http.IncomingMessage) {
    data.http = parsers.parseRequest(data.request)
  }
  delete data.request

  var trans = this._instrumentation.currentTransaction
  if (!data.http && trans && trans.req) data.http = parsers.parseRequest(trans.req)

  var errUUID = data.extra && data.extra.uuid || uuid.v4()

  if (!util.isError(err)) {
    var isMessage = true
    var customCulprit = 'culprit' in data
    parsers.parseMessage(err, data)
    logger.error(data.message, { uuid: errUUID })
    err = new Error(data.message)
  } else if (this.ff_captureFrame && !err.uncaught) {
    var captureFrameError = new Error()
  }

  if (!isMessage) {
    logger.error('logging error with Opbeat:', { uuid: errUUID })
    logger.error(err.stack)
  }

  parsers.parseError(err, data, function (data) {
    if (isMessage) {
      // Messages shouldn't have an exception and the algorithm for finding the
      // culprit might show the Opbeat agent and we don't want that
      delete data.exception
      if (!customCulprit) delete data.culprit
      if (data.stacktrace) data.stacktrace.frames.shift()
    }

    var done = function () {
      if (data.stacktrace) data.stacktrace.frames.reverse() // opbeat expects frames in reverse order
      data.machine = { hostname: agent.hostname }
      data.extra = data.extra || {}
      data.extra.node = process.version
      if (!data.extra.uuid) data.extra.uuid = errUUID
      data.timestamp = captureTime.toISOString()

      if (agent.filter) data = agent.filter(err, data)
      if (agent.active) request.error(agent, data, cb)
      // In v3.x, the captureError callback will only be called if the agent is
      // active. This is scheduled to change in v4.x. When using the middleware
      // we want to call the next function even if the agent is inactive, so
      // until we release v4.x we need a way to tell the captureError function
      // that the callback should be called even if the agent is inactive. This
      // is done by naming the callback `_opbeatMiddleware`.
      // TODO: Undo this hack in v4.x
      else if (cb && cb.name === '_opbeatMiddleware') cb()
    }

    if (captureFrameError && (!data.stacktrace || !data.stacktrace.frames.some(function (frame) { return frame.in_app }))) {
      // prepare to add a top frame to the stack trace specifying the location
      // where captureError was called from. This can make it easier to debug
      // async stack traces.
      parsers.parseError(captureFrameError, {}, function (result) {
        // ignore the first frame as it will be the opbeat module
        if (result.stacktrace) var frame = result.stacktrace.frames[1]
        if (data.stacktrace) data.stacktrace.frames.unshift(frame)
        else if (frame) data.stacktrace = { frames: [frame] }
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
    var data = {
      extra: { uuid: uuid.v4() },
      level: agent.exceptionLogLevel
    }

    debug('Opbeat caught unhandled exception %o', { uuid: data.extra.uuid })

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    agent.removeAllListeners()
    // But make sure emitted errors doesn't cause yet another uncaught
    // exception
    agent.on('error', errorLogger)

    err.uncaught = true

    agent.captureError(err, data, function (opbeatErr, url) {
      if (opbeatErr) {
        logger.error('Could not notify Opbeat', { uuid: data.extra.uuid })
        logger.error(opbeatErr.stack)
      } else {
        logger.info('Opbeat logged error successfully at %s', url, { uuid: data.extra.uuid })
      }
      cb ? cb(err, url) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Agent.prototype.trackRelease = function (data, cb) {
  if (!this._releaseTracker) this._releaseTracker = ReleaseTracker(this._httpClient)
  this._releaseTracker(data, cb || noop)
}

function errorLogger (err, uuid) {
  logger.error('Could not notify Opbeat', { uuid: uuid })
  logger.error(err.stack)
}
