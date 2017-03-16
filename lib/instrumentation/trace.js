'use strict'

var debug = require('debug')('opbeat')

module.exports = Trace

function Trace (transaction) {
  this.transaction = transaction
  this.started = false
  this.truncated = false
  this.ended = false
  this.extra = {}
  this.name = null
  this.type = null
  this._start = 0
  this._hrtime = null
  this._diff = null
  this._stackObj = null
  this._agent = transaction._agent
  this._parent = transaction._rootTrace

  debug('init trace %o', { uuid: this.transaction._uuid })
}

Trace.prototype.start = function (name, type) {
  if (this.started) {
    debug('tried to call trace.start() on already started trace %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return
  }

  this.started = true
  this.name = name || this.name || 'unnamed'
  this.type = type || this.type || 'custom'

  if (!this._stackObj) this._recordStackTrace()

  this._start = Date.now()
  this._hrtime = process.hrtime()

  debug('start trace %o', {uuid: this.transaction._uuid, name: name, type: type})
}

Trace.prototype.customStackTrace = function (stackObj) {
  debug('applying custom stack trace to trace %o', {uuid: this.transaction._uuid})
  this._recordStackTrace(stackObj)
}

Trace.prototype.truncate = function () {
  if (!this.started) {
    debug('tried to truncate non-started trace - ignoring %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return
  } else if (this.ended) {
    debug('tried to truncate already ended trace - ignoring %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return
  }
  this.truncated = true
  this.end()
}

Trace.prototype.end = function () {
  if (this.ended) {
    debug('tried to call trace.end() on already ended trace %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return
  }

  this._diff = process.hrtime(this._hrtime)
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  debug('ended trace %o', {uuid: this.transaction._uuid, name: this.name, type: this.type, truncated: this.truncated})
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call trace.duration() on un-ended trace %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('tried to call trace.startTime() for un-ended trace/transaction %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return null
  }

  if (!this._parent) return 0
  var start = this._parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('tried to call trace.ancestors() for un-ended trace/transaction %o', {uuid: this.transaction._uuid, name: this.name, type: this.type})
    return null
  }

  if (!this._parent) return []
  return this._parent.ancestors().concat(this._parent.name)
}

Trace.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, this)
  }
  this._stackObj = { err: obj }
}
