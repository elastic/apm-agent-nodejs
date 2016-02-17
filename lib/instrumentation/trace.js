'use strict'

var knownGroupingKeys = require('lru-cache')({ max: 5000 })
var debug = require('debug')('opbeat')

module.exports = Trace

function Trace (transaction) {
  this.transaction = transaction
  this.ended = false
  this.extra = {}
  this._agent = this.transaction._agent
  this._parent = transaction._rootTrace
  this._agent._instrumentation.currentTrace = this

  debug('init trace %o', { uuid: this.transaction._uuid })
}

Trace.prototype.start = function (signature, type) {
  this.signature = signature
  this.type = type || 'custom.code'

  this._recordStackTrace()

  this._start = new Date()
  this._hrtime = process.hrtime()
  debug('start trace %o', { uuid: this.transaction._uuid, signature: signature, type: type })
}

Trace.prototype._recordStackTrace = function () {
  var key = this._stacktraceGroupingKey()
  var known = knownGroupingKeys.get(key)
  if (!known) {
    var err = {}
    Error.captureStackTrace(err, this)
    this._stackObj = { err: err }
    knownGroupingKeys.set(key, true)
  }
}

Trace.prototype._stacktraceGroupingKey = function () {
  var key = this.type + '|' + this.signature
  var prev = this._parent
  while (prev) {
    key += '|' + prev.signature
    prev = prev._parent
  }
  return key
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
  debug('ended trace %o', { uuid: this.transaction._uuid, signature: this.signature, type: this.type })
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    debug('Trying to call trace.duration() on un-ended Trace %o', { uuid: this.transaction._uuid })
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('Trying to call trace.startTime() for un-ended Trace/Transaction %o', { uuid: this.transaction._uuid })
    return null
  }

  if (!this._parent) return 0
  var start = this._parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  if (!this.ended || !this.transaction.ended) {
    debug('Trying to call trace.ancestors() for un-ended Trace/Transaction %o', { uuid: this.transaction._uuid })
    return null
  }

  if (!this._parent) return []
  return this._parent.ancestors().concat(this._parent.signature)
}
