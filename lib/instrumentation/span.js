'use strict'

var util = require('util')

var afterAll = require('after-all-results')
var Value = require('async-value-promise')

const constants = require('../constants')
var GenericSpan = require('./generic-span')
var parsers = require('../parsers')
var stackman = require('../stackman')
var { SpanIds } = require('./ids')

const TEST = process.env.ELASTIC_APM_TEST

module.exports = Span

util.inherits(Span, GenericSpan)

function Span (transaction, name, ...args) {
  var childOf = transaction._agent._instrumentation.activeSpan || transaction
  const opts = typeof args[args.length - 1] === 'object'
    ? (args.pop() || {})
    : {}

  opts.timer = childOf._timer
  if (!opts.childOf) {
    opts.childOf = childOf
  }

  GenericSpan.call(this, transaction._agent, ...args, opts)

  this._db = null
  this._http = null
  this._destination = null
  this._message = null
  this._stackObj = null

  this.transaction = transaction
  this.name = name || 'unnamed'

  this._agent._instrumentation.bindingSpan = this

  if (this._agent._conf.captureSpanStackTraces) {
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

  this._setOutcomeFromSpanEnd()

  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  this._agent.logger.debug('ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })
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

  var self = this

  // NOTE: This uses a promise-like thing and not a *real* promise
  // because passing error stacks into a promise context makes it
  // uncollectable by the garbage collector.
  var stack = new Value()
  this._stackObj = stack

  // TODO: This is expensive! Consider if there's a way to cache some of this
  stackman.callsites(obj, function (err, callsites) {
    if (err) return stack.reject(err)
    if (!TEST) callsites = callsites.filter(filterCallsite)

    var next = afterAll((err, res) => {
      err ? stack.reject(err) : stack.resolve(res)
    })

    for (const callsite of callsites) {
      parsers.parseCallsite(callsite, false, self._agent, next())
    }
  })
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
      context: undefined,
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

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
