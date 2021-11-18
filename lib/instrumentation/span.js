'use strict'

const { executionAsyncId } = require('async_hooks')
var util = require('util')

var Value = require('async-value-promise')

const constants = require('../constants')
var GenericSpan = require('./generic-span')
var { SpanIds } = require('./ids')
const { gatherStackTrace } = require('../stacktraces')

const TEST = process.env.ELASTIC_APM_TEST

module.exports = Span

util.inherits(Span, GenericSpan)

function Span (transaction, name, ...args) {
  const defaultChildOf = transaction._agent._instrumentation.currSpan() || transaction
  const opts = typeof args[args.length - 1] === 'object'
    ? (args.pop() || {})
    : {}

  if (!opts.childOf) {
    opts.childOf = defaultChildOf
    opts.timer = defaultChildOf._timer
  } else if (opts.childOf._timer) {
    opts.timer = opts.childOf._timer
  }

  this._exitSpan = !!opts.exitSpan
  delete opts.exitSpan

  GenericSpan.call(this, transaction._agent, ...args, opts)

  this._db = null
  this._http = null
  this._destination = null
  this._destinationServiceResource = null
  this._excludeDestinationService = false
  this._message = null
  this._stackObj = null
  this._capturedStackTrace = null
  this.sync = true
  this._startXid = executionAsyncId()

  this.transaction = transaction
  this.name = name || 'unnamed'

  if (this._agent._conf.captureSpanStackTraces && this._agent._conf.spanFramesMinDuration !== 0) {
    this._recordStackTrace()
  }

  this._agent.logger.debug('start span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })
}

Object.defineProperty(Span.prototype, 'ids', {
  get () {
    return this._ids === null
      ? (this._ids = new SpanIds(this))
      : this._ids
  }
})

Span.prototype.toString = function () {
  return this.ids.toString()
}

Span.prototype.customStackTrace = function (stackObj) {
  this._agent.logger.debug('applying custom stack trace to span %o', { span: this.id, parent: this.parentId, trace: this.traceId })
  this._recordStackTrace(stackObj)
}

Span.prototype.end = function (endTime) {
  if (this.ended) {
    this._agent.logger.debug('tried to call span.end() on already ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })
    return
  }

  this._timer.end(endTime)
  if (executionAsyncId() !== this._startXid) {
    this.sync = false
  }

  this._setOutcomeFromSpanEnd()

  // Determine `span.context.destination.service.*` per
  // https://github.com/elastic/apm/blob/master/specs/agents/tracing-spans-destination.md
  if (this._excludeDestinationService) {
    // pass through
  } else if (this._destinationServiceResource) {
    if (!this._destination) {
      this._destination = {}
    }
    this._destination.service = {
      resource: this._destinationServiceResource,
      // Required fields in intake API <=v7.15.
      name: '',
      type: ''
    }
  } else if (this._exitSpan) {
    // Infer resource from other context values, for exit spans.
    if (!this._destination) {
      this._destination = {}
    }
    let resource
    if (this._db) {
      if (this._db.instance) {
        resource = `${this.subtype || this.type}/${this._db.instance}`
      } else {
        resource = this.subtype || this.type
      }
    } else if (this._message) {
      if (this._message.queue && this._message.queue.name) {
        resource = `${this.subtype || this.type}/${this._message.queue.name}`
      } else {
        resource = this.subtype || this.type
      }
    } else if (this._http && this._http.url) {
      // XXX This inefficiently requires re-parsing the URL. Do better.
      console.warn('XXX resource from: this._http.url', this._http.url)
      throw new Error('XXX')
      // if (context.http.url.port > 0)
      //   "${context.http.url.host}:${context.http.url.port}"
      // else if (context.http.url.host)
      //   context.http.url.host
    } else {
      resource = this.subtype || this.type
    }
    this._destination.service = {
      resource: resource,
      // Required fields in intake API <=v7.15.
      name: '',
      type: ''
    }
  }

  this.ended = true
  this._agent.logger.debug('ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })

  // TODO: This is expensive! Consider if there's a way to cache some of this
  if (this._capturedStackTrace !== null && this._agent._conf.spanFramesMinDuration !== 0 && this.duration() / 1000 > this._agent._conf.spanFramesMinDuration) {
    // NOTE: This uses a promise-like thing and not a *real* promise
    // because passing error stacks into a promise context makes it
    // uncollectable by the garbage collector.
    this._stackObj = new Value()
    var self = this
    gatherStackTrace(
      this._agent.logger,
      this._capturedStackTrace,
      this._agent._conf.sourceLinesSpanAppFrames,
      this._agent._conf.sourceLinesSpanLibraryFrames,
      TEST ? null : filterCallSite,
      function (_err, stacktrace) {
        // _err from gatherStackTrace is always null.
        self._stackObj.resolve(stacktrace)
      }
    )
  }

  this._agent._instrumentation.addEndedSpan(this)
  this.transaction._captureBreakdown(this)
}

Span.prototype.setDbContext = function (context) {
  if (!context) return
  this._db = Object.assign(this._db || {}, context)
}

Span.prototype.setHttpContext = function (context) {
  if (!context) return
  this._http = Object.assign(this._http || {}, context)
}

// XXX remove this, nothing should call it anymore
Span.prototype.setDestinationContext = function (context) {
  this._destination = Object.assign(this._destination || {}, context)
}

// Set values for `span.context.destination.{address,port}`.
//
// @param {string|null} address - The hostname
// @param {integer|null} port
Span.prototype.setDestinationAddress = function (host, port) {
  if (!this._destination) {
    this._destination = {}
  }
  if (typeof host === 'string') {
    this._destination.address = host
  } else if (host === null) {
    delete this._destination.address
  }
  if (typeof port === 'number') {
    this._destination.port = port
  } else if (port === null) {
    delete this._destination.port
  }
}

// Public method to set `span.context.destination.service.resource`, to
// override a value inferred for exit spans. `null` indicates no
// `span.context.destination` should be set.
Span.prototype.setDestinationService = function (resource) {
  if (typeof resource === 'string') {
    this._destinationServiceResource = resource
    this._excludeDestinationService = false
  } else {
    this._destinationServiceResource = null
    this._excludeDestinationService = true
  }
}

Span.prototype.setMessageContext = function (context) {
  this._message = Object.assign(this._message || {}, context)
}

Span.prototype.setOutcome = function (outcome) {
  if (!this._isValidOutcome(outcome)) {
    this._agent.logger.trace(
      'Unknown outcome [%s] seen in Span.setOutcome, ignoring',
      outcome
    )
    return
  }

  if (this.ended) {
    this._agent.logger.debug(
      'tried to call Span.setOutcome() on already ended span %o',
      { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action }
    )
    return
  }
  this._freezeOutcome()
  this.outcome = outcome
}

Span.prototype._setOutcomeFromErrorCapture = function (outcome) {
  if (this._isOutcomeFrozen) {
    return
  }
  this.outcome = outcome
}

Span.prototype._setOutcomeFromHttpStatusCode = function (statusCode) {
  if (this._isOutcomeFrozen) {
    return
  }
  /**
   * The statusCode could be undefined for example if,
   * the request is aborted before socket, in that case
   * we keep the default 'unknown' value.
   */
  if (typeof statusCode !== 'undefined') {
    if (statusCode >= 400) {
      this.outcome = constants.OUTCOME_FAILURE
    } else {
      this.outcome = constants.OUTCOME_SUCCESS
    }
  }

  this._freezeOutcome()
}

Span.prototype._setOutcomeFromSpanEnd = function () {
  if (this.outcome === constants.OUTCOME_UNKNOWN && !this._isOutcomeFrozen) {
    this.outcome = constants.OUTCOME_SUCCESS
  }
}

Span.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, Span)
  }
  this._capturedStackTrace = obj
}

Span.prototype._encode = function (cb) {
  var self = this

  if (!this.ended) return cb(new Error('cannot encode un-ended span'))

  if (this._agent._conf.captureSpanStackTraces && this._stackObj) {
    this._stackObj.then(
      value => done(null, value),
      error => done(error)
    )
  } else {
    process.nextTick(done)
  }

  function done (err, frames) {
    if (err) {
      self._agent.logger.debug('could not capture stack trace for span %o', { span: self.id, parent: self.parentId, trace: self.traceId, name: self.name, type: self.type, subtype: self.subtype, action: self.action, err: err.message })
    }

    var payload = {
      id: self.id,
      transaction_id: self.transaction.id,
      parent_id: self.parentId,
      trace_id: self.traceId,
      name: self.name,
      type: self.type || 'custom',
      subtype: self.subtype,
      action: self.action,
      timestamp: self.timestamp,
      duration: self.duration(),
      stacktrace: frames,
      sync: self.sync,
      outcome: self.outcome
    }

    // if a valid sample rate is set (truthy or zero), set the property
    const sampleRate = self.sampleRate
    if (sampleRate !== null) {
      payload.sample_rate = sampleRate
    }

    if (self._db || self._http || self._labels || self._destination || self._message) {
      payload.context = {
        db: self._db || undefined,
        http: self._http || undefined,
        tags: self._labels || undefined,
        destination: self._destination || undefined,
        message: self._message || undefined
      }
    }

    cb(null, payload)
  }
}

function filterCallSite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
