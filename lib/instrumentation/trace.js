'use strict'

var debug = require('debug')('opbeat')

module.exports = Trace

function Trace (transaction) {
  this.transaction = transaction
  this.started = false
  this.ended = false
  this.extra = {}
  this.signature = null
  this.type = null
  this._start = 0
  this._hrtime = null
  this._diff = null
  this._stackObj = null
  this._agent = transaction._agent
  this._parent = transaction._rootTrace

  debug('init trace %o', { uuid: this.transaction._uuid })
}

Trace.prototype.start = function (signature, type) {
  if (this.started) {
    debug('tried to call trace.start() on already started trace %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
    return
  }

  this.started = true
  this.signature = signature || this.signature
  this.type = type || this.type || 'custom.code'

  this._recordStackTrace()

  this._start = Date.now()
  this._hrtime = process.hrtime()

  debug('start trace %o', { uuid: this.transaction._uuid, signature: signature, type: type })
}

Trace.prototype.end = function () {
  if (this.ended) {
    debug('tried to call trace.end() on already ended trace %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
    return
  }

  this._diff = process.hrtime(this._hrtime)
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  debug('ended trace %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call trace.duration() on un-ended trace %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('tried to call trace.startTime() for un-ended trace/transaction %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
    return null
  }

  if (!this._parent) return 0
  var start = this._parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('tried to call trace.ancestors() for un-ended trace/transaction %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
    return null
  }

  if (!this._parent) return []
  return this._parent.ancestors().concat(this._parent.signature)
}

Trace.prototype._recordStackTrace = function () {
  var err = {}
  Error.captureStackTrace(err, this)
  this._stackObj = { err: err }
}
