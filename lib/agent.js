'use strict'

var http = require('http')
var parseUrl = require('url').parse
var path = require('path')

var afterAll = require('after-all-results')
var debug = require('debug')('elastic-apm')
var ElasticAPMHttpClient = require('elastic-apm-http-client')
var isError = require('core-util-is').isError
var ancestors = require('require-ancestors')
var uuid = require('uuid')

var config = require('./config')
var connect = require('./middleware/connect')
var Filters = require('./filters')
var Instrumentation = require('./instrumentation')
var logger = require('./logger')
var parsers = require('./parsers')
var request = require('./request')
var stackman = require('./stackman')
var symbols = require('./symbols')

var IncomingMessage = http.IncomingMessage
var ServerResponse = http.ServerResponse

var version = require('../package').version
var userAgent = 'elastic-apm-node/' + version

module.exports = Agent

function Agent () {
  var boundConnect = connect.bind(this)
  this.middleware = { connect: boundConnect }

  this._instrumentation = new Instrumentation(this)
  this._filters = new Filters()

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

Agent.prototype.startSpan = function (name, type) {
  var span = this._instrumentation.buildSpan.apply(this._instrumentation)
  if (span) span.start(name, type)
  return span
}

Agent.prototype.buildSpan = function () {
  return this._instrumentation.buildSpan.apply(this._instrumentation, arguments)
}

Agent.prototype._config = function (opts) {
  this._conf = config(opts)

  this._conf.serverHost = this._conf.serverUrl
    ? parseUrl(this._conf.serverUrl).hostname
    : 'localhost'

  logger.init({level: this._conf.logLevel})
}

Agent.prototype.start = function (opts) {
  if (global[symbols.agentInitialized]) throw new Error('Do not call .start() more than once')
  global[symbols.agentInitialized] = true

  this._config(opts)
  this._filters.config(this._conf)

  if (!this._conf.active) {
    logger.info('Elastic APM agent is inactive due to configuration')
    return this
  } else if (!this._conf.serviceName) {
    logger.error('Elastic APM isn\'t correctly configured: Missing serviceName')
    this._conf.active = false
    return this
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(this._conf.serviceName)) {
    logger.error('Elastic APM isn\'t correctly configured: serviceName "%s" contains invalid characters! (allowed: a-z, A-Z, 0-9, _, -, <space>)', this._conf.serviceName)
    this._conf.active = false
    return this
  } else if (process.env.DEBUG) {
    var _ancestors = ancestors(module)
    var basedir = path.dirname(_ancestors[_ancestors.length - 1])
    var stackObj = {}
    Error.captureStackTrace(stackObj)

    try {
      var pkg = require(path.join(basedir, 'package.json'))
    } catch (e) {}

    debug('agent configured correctly %o', {
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

  this._instrumentation.start()

  this._httpClient = new ElasticAPMHttpClient({
    secretToken: this._conf.secretToken,
    userAgent: userAgent,
    serverUrl: this._conf.serverUrl,
    rejectUnauthorized: this._conf.verifyServerCert,
    serverTimeout: this._conf.serverTimeout * 1000
  })

  Error.stackTraceLimit = this._conf.stackTraceLimit
  if (this._conf.captureExceptions) this.handleUncaughtExceptions()

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
    error.id = id
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
        trans && trans._tags,
        opts && opts.tags
      ),
      custom: Object.assign(
        {},
        trans && trans._custom,
        opts && opts.custom
      )
    }
    if (trans) error.transaction = {id: trans.id}

    if (error.exception) {
      error.exception.handled = !opts || opts.handled
    }

    if (req) {
      var config = agent._conf.captureBody
      var captureBody = config === 'errors' || config === 'all'
      error.context.request = parsers.getContextFromRequest(req, captureBody)
    }

    if (res) {
      error.context.response = parsers.getContextFromResponse(res, true)
    }

    if (captureLocation) {
      // prepare to add a stack trace pointing to where captureError was called
      // from. This can make it easier to debug async stack traces.
      stackman.callsites(captureLocation, function (_err, callsites) {
        if (_err) {
          debug('error while getting capture location callsites: %s', _err.message)
        }

        var next = afterAll(function (_, frames) {
          // As of now, parseCallsite suppresses errors internally, but even if
          // they were passed on, we would want to suppress them here anyway

          if (frames) {
            // In case there isn't any log object, we'll make a dummy message
            // as the APM Server requires a message to be present if a
            // stacktrace also present
            if (!error.log) error.log = {message: error.exception.message}
            error.log.stacktrace = frames
          }

          send(error)
        })

        if (callsites) {
          callsites.forEach(function (callsite) {
            parsers.parseCallsite(callsite, true, agent._conf, next())
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
    agent.captureError(err, {handled: false}, function () {
      cb ? cb(err) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Agent.prototype.flush = function (cb) {
  this._instrumentation.flush(cb)
}
