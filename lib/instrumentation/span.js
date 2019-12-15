'use strict'

var util = require('util')

var afterAll = require('after-all-results')
var Value = require('async-value-promise')

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
      sync: self.sync
    }

    if (self._db || self._http || self._labels) {
      payload.context = {
        db: self._db || undefined,
        http: self._http || undefined,
        tags: self._labels || undefined
      }
    }

    cb(null, payload)
  }
}

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
