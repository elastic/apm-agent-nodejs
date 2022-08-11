/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

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

// new Span(transaction)
// new Span(transaction, name?, opts?)
// new Span(transaction, name?, type?, opts?)
// new Span(transaction, name?, type?, subtype?, opts?)
// new Span(transaction, name?, type?, subtype?, action?, opts?)
function Span (transaction, ...args) {
  const opts = typeof args[args.length - 1] === 'object'
    ? (args.pop() || {})
    : {}
  const [name, ...tsaArgs] = args // "tsa" === Type, Subtype, Action

  if (!opts.childOf) {
    const defaultChildOf = transaction._agent._instrumentation.currSpan() || transaction
    opts.childOf = defaultChildOf
    opts.timer = defaultChildOf._timer
  } else if (opts.childOf._timer) {
    opts.timer = opts.childOf._timer
  }

  this._exitSpan = !!opts.exitSpan
  this.discardable = this._exitSpan

  delete opts.exitSpan

  GenericSpan.call(this, transaction._agent, ...tsaArgs, opts)

  this._db = null
  this._http = null
  this._destination = null
  this._message = null
  this._stackObj = null
  this._capturedStackTrace = null
  this.sync = true
  this._startXid = executionAsyncId()

  this.transaction = transaction
  this.name = name || 'unnamed'

  if (this._agent._conf.spanStackTraceMinDuration >= 0) {
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
  this._endTimestamp = this._timer.endTimestamp
  this._duration = this._timer.duration
  if (executionAsyncId() !== this._startXid) {
    this.sync = false
  }

  this._setOutcomeFromSpanEnd()

  this.ended = true
  this._agent.logger.debug('ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })

  if (this._capturedStackTrace !== null &&
      this._agent._conf.spanStackTraceMinDuration >= 0 &&
      this._duration / 1000 >= this._agent._conf.spanStackTraceMinDuration) {
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

Span.prototype.setDestinationContext = function (context) {
  this._destination = Object.assign(this._destination || {}, context)
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
  this._setOutcome(outcome)
}

Span.prototype._setOutcomeFromErrorCapture = function (outcome) {
  if (this._isOutcomeFrozen) {
    return
  }
  this._setOutcome(outcome)
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
      this._setOutcome(constants.OUTCOME_FAILURE)
    } else {
      this._setOutcome(constants.OUTCOME_SUCCESS)
    }
  }

  this._freezeOutcome()
}

Span.prototype._setOutcomeFromSpanEnd = function () {
  if (this.outcome === constants.OUTCOME_UNKNOWN && !this._isOutcomeFrozen) {
    this._setOutcome(constants.OUTCOME_SUCCESS)
  }
}

/**
 * Central setting for outcome
 *
 * Enables "when outcome does X, Y should also happen" behaviors
 */
Span.prototype._setOutcome = function (outcome) {
  this.outcome = outcome
  if (outcome !== constants.OUTCOME_SUCCESS) {
    this.discardable = false
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

  const payload = {
    id: self.id,
    transaction_id: self.transaction.id,
    parent_id: self.parentId,
    trace_id: self.traceId,
    name: self.name,
    type: self.type || 'custom',
    subtype: self.subtype,
    action: self.action,
    timestamp: self.timestamp,
    duration: self._duration,
    context: undefined,
    stacktrace: undefined,
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

  if (self.isComposite()) {
    payload.composite = self._compression.encode()
    payload.timestamp = self._compression.timestamp
    payload.duration = self._compression.duration
  }

  this._serializeOTel(payload)

  if (this._links.length > 0) {
    payload.links = this._links
  }

  if (this._stackObj) {
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
    } else if (frames) {
      payload.stacktrace = frames
    }

    // Reduce this span's memory usage by dropping references once they're
    // no longer needed.  We also keep fields required to support
    // `interface Span`.
    // Span fields:
    self._db = null
    self._http = null
    self._message = null
    self._capturedStackTrace = null
    // GenericSpan fields:
    // - Cannot drop `this._context` because it is used for traceparent and ids.
    self._timer = null
    self._labels = null

    cb(null, payload)
  }
}

Span.prototype.isCompressionEligible = function () {
  if (!this.getParentSpan()) {
    return false
  }

  if (this.outcome !== constants.OUTCOME_UNKNOWN &&
      this.outcome !== constants.OUTCOME_SUCCESS
  ) {
    return false
  }

  if (!this._exitSpan) {
    return false
  }

  if (this._hasPropagatedTraceContext) {
    return false
  }

  return true
}

Span.prototype.tryToCompress = function (spanToCompress) {
  return this._compression.tryToCompress(this, spanToCompress)
}

Span.prototype.isRecorded = function () {
  return this._context.isRecorded()
}

Span.prototype.setRecorded = function (value) {
  return this._context.setRecorded(value)
}

Span.prototype.propagateTraceContextHeaders = function (carrier, setter) {
  this.discardable = false
  return GenericSpan.prototype.propagateTraceContextHeaders.call(this, carrier, setter)
}

function filterCallSite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
