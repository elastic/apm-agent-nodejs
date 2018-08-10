'use strict'

var http = require('http')
var parseUrl = require('url').parse
var path = require('path')

var afterAll = require('after-all-results')
var ElasticAPMHttpClient = require('elastic-apm-http-client')
var isError = require('core-util-is').isError
var ancestors = require('require-ancestors')
var uuid = require('uuid')

var config = require('./config')
var connect = require('./middleware/connect')
var Filters = require('./filters')
var Instrumentation = require('./instrumentation')
var parsers = require('./parsers')
var stackman = require('./stackman')
var symbols = require('./symbols')

var IncomingMessage = http.IncomingMessage
var ServerResponse = http.ServerResponse

var version = require('../package').version
var userAgent = 'elastic-apm-node/' + version

module.exports = Agent

function Agent () {
  this.middleware = { connect: connect.bind(this) }

  this._instrumentation = new Instrumentation(this)
  this._filters = new Filters()
  this._apmServer = null

  this._conf = null
  this._httpClient = null
  this._uncaughtExceptionListener = null

  this._config()
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

Agent.prototype.destroy = function () {
  if (this._apmServer) this._apmServer.destroy()
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
}

Agent.prototype.isStarted = function () {
  return global[symbols.agentInitialized]
}

Agent.prototype.start = function (opts) {
  if (this.isStarted()) throw new Error('Do not call .start() more than once')
  global[symbols.agentInitialized] = true

  this._config(opts)
  this._filters.config(this._conf)

  if (!this._conf.active) {
    this.logger.info('Elastic APM agent is inactive due to configuration')
    return this
  } else if (!this._conf.serviceName) {
    this.logger.error('Elastic APM isn\'t correctly configured: Missing serviceName')
    this._conf.active = false
    return this
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(this._conf.serviceName)) {
    this.logger.error('Elastic APM isn\'t correctly configured: serviceName "%s" contains invalid characters! (allowed: a-z, A-Z, 0-9, _, -, <space>)', this._conf.serviceName)
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

    this.logger.debug('agent configured correctly %o', {
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

  this._apmServer = new ElasticAPMHttpClient({
    // metadata
    agentName: 'nodejs',
    agentVersion: version,
    serviceName: this._conf.serviceName,
    serviceVersion: this._conf.serviceVersion,
    frameworkName: this._conf.frameworkName,
    frameworkVersion: this._conf.frameworkVersion,
    hostname: this._conf.hostname,

    // Sanitize conf
    truncateKeywordsAt: config.INTAKE_STRING_MAX_SIZE,
    truncateErrorMessagesAt: this._conf.errorMessageMaxLength,

    // HTTP conf
    secretToken: this._conf.secretToken,
    userAgent: userAgent,
    serverUrl: this._conf.serverUrl,
    rejectUnauthorized: this._conf.verifyServerCert,
    serverTimeout: this._conf.serverTimeout * 1000,

    // Streaming conf
    size: this._conf.apiRequestSize,
    time: this._conf.apiRequestTime * 1000,

    // Debugging
    payloadLogFile: this._conf.payloadLogFile
  })
  this._apmServer.on('error', err => {
    this.logger.error('An error occrued while communicating with the APM Server:', err.message)
  })

  this._instrumentation.start()

  Error.stackTraceLimit = this._conf.stackTraceLimit
  if (this._conf.captureExceptions) this.handleUncaughtExceptions()

  return this
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

Agent.prototype.setTag = function (key, value) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.setTag(key, value)
}

Agent.prototype.addTags = function (tags) {
  var trans = this.currentTransaction
  if (!trans) return false
  return trans.addTags(tags)
}

Agent.prototype.addFilter = function (fn) {
  if (typeof fn !== 'function') {
    this.logger.error('Can\'t add filter of type %s', typeof fn)
    return
  }

  this._filters.add(fn)
}

Agent.prototype.captureError = function (err, opts, cb) {
  if (typeof opts === 'function') return this.captureError(err, null, opts)

  var agent = this
  var trans = this.currentTransaction
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
    if (trans) error.transaction = { id: trans.id }

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
          agent.logger.debug('error while getting capture location callsites: %s', _err.message)
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
          callsites.forEach(function (callsite) {
            parsers.parseCallsite(callsite, true, agent, next())
          })
        }
      })
    } else {
      send(error)
    }
  }

  function send (error) {
    error = agent._filters.process(error) // TODO: Update filter to expect this format

    if (!error) {
      agent.logger.debug('error ignored by filter %o', { id: id })
      cb(null, id)
      return
    }

    if (agent._apmServer) {
      agent.logger.info(`Sending error ${id} to Elastic APM`)
      agent._apmServer.sendError(error, function () {
        agent._apmServer.flush(function (err) {
          cb(err, id)
        })
      })
    } else {
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
    agent.logger.debug('Elastic APM caught unhandled exception: %s', err.message)
    agent.captureError(err, { handled: false }, function () {
      cb ? cb(err) : process.exit(1)
    })
  }

  process.on('uncaughtException', this._uncaughtExceptionListener)
}

Agent.prototype.flush = function (cb) {
  if (this._apmServer) {
    this._apmServer.flush(cb)
  } else {
    this.logger.warn(new Error('cannot flush agent before it is started'))
    process.nextTick(cb)
  }
}

Agent.prototype.lambda = function wrapLambda (type, fn) {
  var agent = this
  if (typeof type === 'function') {
    fn = type
    type = 'lambda'
  }
  return function wrappedLambda (payload, context, callback) {
    var trans = agent.startTransaction(context.functionName, type)

    const succeed = wrapLambdaCallback((_, res) => context.succeed(res))
    const done = wrapLambdaCallback((err, res) => context.done(err, res))
    const fail = wrapLambdaCallback((err) => context.fail(err))

    const wrappedContext = Object.assign({}, context, {
      succeed: data => succeed(null, data),
      done: done,
      fail: fail
    })

    return fn.call(this, payload, wrappedContext, wrapLambdaCallback(callback))

    function wrapLambdaCallback (callback) {
      return function wrappedLambdaCallback (err, result) {
        var context = this

        trans.setCustomContext({
          lambda: {
            functionName: wrappedContext.functionName,
            functionVersion: wrappedContext.functionVersion,
            invokedFunctionArn: wrappedContext.invokedFunctionArn,
            memoryLimitInMB: wrappedContext.memoryLimitInMB,
            awsRequestId: wrappedContext.awsRequestId,
            logGroupName: wrappedContext.logGroupName,
            logStreamName: wrappedContext.logStreamName,
            executionEnv: process.env.AWS_EXECUTION_ENV,
            region: process.env.AWS_REGION,
            input: payload,
            output: result
          }
        })

        if (err) {
          agent.captureError(err, done)
        } else {
          setImmediate(done)
        }

        function done () {
          trans.end()
          agent.flush(function flushCallback () {
            callback.call(context, err, result)
          })
        }
      }
    }
  }
}
