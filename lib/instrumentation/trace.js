'use strict'

var debug = require('debug')('opbeat')
var Timer = require('./timer')

module.exports = Trace

function Trace (transaction) {
  this.transaction = transaction
  this.started = false
  this.truncated = false
  this.ended = false
  this.extra = {}
  this.name = null
  this.type = null
  this._timer = null
  this._stackObj = null
  this._agent = transaction._agent

  debug('init trace %o', {id: this.transaction.id})
}

Trace.prototype.start = function (name, type) {
  if (this.started) {
    debug('tried to call trace.start() on already started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this.started = true
  this.name = name || this.name || 'unnamed'
  this.type = type || this.type || 'custom'

  if (!this._stackObj) this._recordStackTrace()

  this._timer = new Timer()

  debug('start trace %o', {id: this.transaction.id, name: name, type: type})
}

Trace.prototype.customStackTrace = function (stackObj) {
  debug('applying custom stack trace to trace %o', {id: this.transaction.id})
  this._recordStackTrace(stackObj)
}

Trace.prototype.truncate = function () {
  if (!this.started) {
    debug('tried to truncate non-started trace - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to truncate already ended trace - ignoring %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }
  this.truncated = true
  this.end()
}

Trace.prototype.end = function () {
  if (!this.started) {
    debug('tried to call trace.end() on un-started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to call trace.end() on already ended trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return
  }

  this._timer.end()
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  debug('ended trace %o', {id: this.transaction.id, name: this.name, type: this.type, truncated: this.truncated})
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call trace.duration() on un-ended trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.duration()
}

// TODO: Rename to startOffsetMs
Trace.prototype.startTime = function () {
  if (!this.started) {
    debug('tried to call trace.startTime() for un-started trace %o', {id: this.transaction.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.offset(this.transaction._timer)
}

Trace.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, this)
  }
  this._stackObj = { err: obj }
}
