'use strict'

var objectAssign = require('object-assign')
var debug = require('debug')('elastic-apm')
var Timer = require('./timer')

module.exports = Span

function Span (transaction) {
  this.transaction = transaction
  this.started = false
  this.truncated = false
  this.ended = false
  this.name = null
  this.type = null
  this._db = null
  this._timer = null
  this._stackObj = null
  this._agent = transaction._agent

  debug('init span %o', {id: this.transaction.id})
}

Span.prototype.start = function (name, type) {
  if (this.started) {
    debug('tried to call span.start() on already started span %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this.started = true
  this.name = name || this.name || 'unnamed'
  this.type = type || this.type || 'custom'

  if (!this._stackObj) this._recordStackTrace()

  this._timer = new Timer()

  debug('start span %o', {id: this.transaction.id, name: name, type: type})
}

Span.prototype.customStackTrace = function (stackObj) {
  debug('applying custom stack trace to span %o', {id: this.transaction.id})
  this._recordStackTrace(stackObj)
}

Span.prototype.truncate = function () {
  if (!this.started) {
    debug('tried to truncate non-started span - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to truncate already ended span - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }
  this.truncated = true
  this.end()
}

Span.prototype.end = function () {
  if (!this.started) {
    debug('tried to call span.end() on un-started span %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to call span.end() on already ended span %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this._timer.end()
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  debug('ended span %o', {id: this.transaction.id, name: this.name, type: this.type, truncated: this.truncated})
  this.transaction._recordEndedSpan(this)
}

Span.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call span.duration() on un-ended span %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.duration()
}

Span.prototype.offsetTime = function () {
  if (!this.started) {
    debug('tried to call span.offsetTime() for un-started span %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.offset(this.transaction._timer)
}

Span.prototype.setDbContext = function (context) {
  if (!context) return
  this._db = objectAssign(this._db || {}, context)
}

Span.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, this)
  }
  this._stackObj = { err: obj }
}
