'use strict'

var http = require('http')
var util = require('util')
var events = require('events')
var uuid = require('node-uuid')
var OpbeatHttpClient = require('opbeat-http-client')
var ReleaseTracker = require('opbeat-release-tracker')
var config = require('./lib/config')
var asyncState = require('./lib/async-state')
var hooks = require('./lib/hooks')
var parsers = require('./lib/parsers')
var request = require('./lib/request')
var connect = require('./lib/middleware/connect')

var userAgent = 'opbeat-nodejs/' + require('./package').version

var Opbeat = module.exports = function (opts) {
  if (!(this instanceof Opbeat)) return new Opbeat(opts)

  events.EventEmitter.call(this)

  opts = config(opts)
  this.appId = opts.appId
  this.organizationId = opts.organizationId
  this.secretToken = opts.secretToken
  this.active = opts.active
  this.clientLogLevel = opts.clientLogLevel
  this.logger = opts.logger
  this.hostname = opts.hostname
  this.stackTraceLimit = opts.stackTraceLimit
  this.captureExceptions = opts.captureExceptions
  this.exceptionLogLevel = opts.exceptionLogLevel
  this.filter = opts.filter
  this._ff_captureFrame = opts._ff_captureFrame

  connect = connect.bind(this)
  this.middleware = { connect: connect, express: connect }

  if (!this.active) {
    this.logger.info('Opbeat logging is disabled for now')
  } else if (!this.appId || !this.organizationId || !this.secretToken) {
    this.logger.info('[WARNING] Opbeat logging is disabled. To enable, specify organization id, app id and secret token')
    this.active = false
  } else {
    this._start()
  }
}

util.inherits(Opbeat, events.EventEmitter)

Opbeat.prototype._start = function () {
  var client = this

  hooks(this) // hook into node for enhanced error tracking

  this._httpClient = OpbeatHttpClient({
    appId: this.appId,
    organizationId: this.organizationId,
    secretToken: this.secretToken,
    userAgent: userAgent
  })

  Error.stackTraceLimit = this.stackTraceLimit
  if (this.captureExceptions) this.handleUncaughtExceptions()

  this.on('error', this._internalErrorLogger)
  this.on('logged', function (url, uuid) {
    client.logger.info('[%s] Opbeat logged error successfully at %s', uuid, url)
  })
}

Opbeat.prototype.captureError = function (err, data, cb) {
  var client = this
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

  if (!data.http && asyncState.req) data.http = parsers.parseRequest(asyncState.req)

  var level = this.exceptionLogLevel || 'error'
  level = level === 'warning' ? 'warn' : level

  var errUUID = data.extra && data.extra.uuid || uuid.v4()

  if (!util.isError(err)) {
    var isMessage = true
    var customCulprit = 'culprit' in data
    parsers.parseMessage(err, data)
    this.logger[level]('[%s]', errUUID, data.message)
    err = new Error(data.message)
  } else if (this._ff_captureFrame && !err.uncaught) {
    var captureFrameError = new Error()
  }

  if (!isMessage) {
    client.logger.info('[%s] logging error with Opbeat:', errUUID)
    client.logger[level](err.stack)
  }

  parsers.parseError(err, data, function (data) {
    if (isMessage) {
      // Messages shouldn't have an exception and the algorithm for finding the
      // culprit might show the Opbeat client and we don't want that
      delete data.exception
      if (!customCulprit) delete data.culprit
      data.stacktrace.frames.shift()
    }

    var done = function () {
      data.stacktrace.frames.reverse() // opbeat expects frames in reverse order
      data.machine = { hostname: client.hostname }
      data.extra = data.extra || {}
      data.extra.node = process.version
      if (!data.extra.uuid) data.extra.uuid = errUUID
      data.timestamp = captureTime.toISOString()

      if (client.filter) data = client.filter(err, data)
      if (client.active) request.error(client, data, cb)
    }

    if (captureFrameError && !data.stacktrace.frames.some(function (frame) { return frame.in_app })) {
      // prepare to add a top frame to the stack trace specifying the location
      // where captureError was called from. This can make it easier to debug
      // async stack traces.
      parsers.parseError(captureFrameError, {}, function (result) {
        // ignore the first frame as it will be the opbeat module
        data.stacktrace.frames.unshift(result.stacktrace.frames[1])
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
Opbeat.prototype.handleUncaughtExceptions = function (cb) {
  var client = this

  if (this._uncaughtExceptionListener) process.removeListener('uncaughtException', this._uncaughtExceptionListener)

  this._uncaughtExceptionListener = function (err) {
    var data = {
      extra: { uuid: uuid.v4() },
      level: client.exceptionLogLevel
    }

    client.logger.debug('[%s] Opbeat caught unhandled exception', data.extra.uuid)

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    client.removeAllListeners()
    // But make sure emitted errors doesn't cause yet another uncaught
    // exception
    client.on('error', client._internalErrorLogger)

    err.uncaught = true

    client.captureError(err, data, function (opbeatErr, url) {
      if (opbeatErr) {
        client.logger.info('[%s] Could not notify Opbeat!', data.extra.uuid)
        client.logger.error(opbeatErr.stack)
      } else {
        client.logger.info('[%s] Opbeat logged error successfully at %s', data.extra.uuid, url)
      }
      cb ? cb(err, url) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Opbeat.prototype.trackRelease = function (data, cb) {
  if (data.path) {
    this.logger.warn('Detected use of deprecated path option to trackRelease function!')
    if (!data.cwd) data.cwd = data.path
  }
  if (!this._releaseTracker) this._releaseTracker = ReleaseTracker(this._httpClient)
  var client = this
  this._releaseTracker(data, function (err) {
    if (cb) cb(err)
    if (err) client.emit('error', err)
  })
}

Opbeat.prototype.trackDeployment = Opbeat.prototype.trackRelease

Opbeat.prototype._internalErrorLogger = function (err, uuid) {
  if (uuid) this.logger.info('[%s] Could not notify Opbeat!', uuid)
  else this.logger.info('Could not notify Opbeat!')
  this.logger.error(err.stack)
}
