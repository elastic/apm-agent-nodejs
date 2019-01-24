'use strict'

var util = require('util')

var afterAll = require('after-all-results')
var Value = require('async-value-promise')

var GenericSpan = require('./generic-span')
var parsers = require('../parsers')
var stackman = require('../stackman')

const TEST = process.env.ELASTIC_APM_TEST

module.exports = Span

util.inherits(Span, GenericSpan)

function Span (transaction, name, type, opts) {
  if (!opts) {
    opts = {
      timer: transaction._timer,
      childOf: transaction._agent._instrumentation.activeSpan || transaction
    }
  } else {
    opts.timer = transaction._timer
    if (!opts.childOf) {
      opts.childOf = transaction._agent._instrumentation.activeSpan || transaction
    }
  }

  GenericSpan.call(this, transaction._agent, type, opts)

  this._db = null
  this._stackObj = null

  this.transaction = transaction
  this.name = name || 'unnamed'

  this._agent._instrumentation.bindingSpan = this

  if (this._agent._conf.captureSpanStackTraces) {
    this._recordStackTrace()
  }

  this._agent.logger.debug('start span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: name, type: type })
}

Span.prototype.customStackTrace = function (stackObj) {
  this._agent.logger.debug('applying custom stack trace to span %o', { span: this.id, parent: this.parentId, trace: this.traceId })
  this._recordStackTrace(stackObj)
}

Span.prototype.end = function (endTime) {
  if (this.ended) {
    this._agent.logger.debug('tried to call span.end() on already ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type })
    return
  }

  this._timer.end(endTime)
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  this._agent.logger.debug('ended span %o', { span: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type })
  this._agent._instrumentation.addEndedSpan(this)
}

Span.prototype.setDbContext = function (context) {
  if (!context) return
  this._db = Object.assign(this._db || {}, context)
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
    if (err || !callsites) {
      self._agent.logger.debug('could not capture stack trace for span %o', { span: self.id, parent: self.parentId, trace: self.traceId, name: self.name, type: self.type, err: err && err.message })
      stack.reject(err)
      return
    }

    if (!TEST) callsites = callsites.filter(filterCallsite)

    var next = afterAll((err, res) => {
      err ? stack.reject(err) : stack.resolve(res)
    })

    callsites.forEach(function (callsite) {
      parsers.parseCallsite(callsite, false, self._agent, next())
    })
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
      self._agent.logger.warn('could not capture stack trace for span %o', { span: self.id, parent: self.parentId, trace: self.traceId, name: self.name, type: self.type, err: err.message })
    }

    var payload = {
      id: self.id,
      transaction_id: self.transaction.id,
      parent_id: self.parentId,
      trace_id: self.traceId,
      name: self.name,
      type: self.type,
      timestamp: self.timestamp,
      duration: self.duration(),
      context: undefined,
      stacktrace: frames
    }

    if (self._db || self._tags) {
      payload.context = {
        db: self._db || undefined,
        tags: self._tags || undefined
      }
    }

    cb(null, payload)
  }
}

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
