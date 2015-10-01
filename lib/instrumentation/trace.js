'use strict'

var asyncState = require('../async-state')

var Trace = module.exports = function (transaction, signature, type) {
  this.transaction = transaction
  this.signature = signature
  this.type = type
  this.ended = false

  this._stackPrevStarted = asyncState.lastTransactionTraceStarted
  asyncState.lastTransactionTraceStarted = this

  this._start = new Date()
  this._hrtime = process.hrtime()
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
  this.transaction._endTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) throw new Error('Trace is not ended')
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  var parent = this._parent()
  if (!parent) return 0
  var start = parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  var parent = this._parent()
  if (!parent) return []
  return [parent.signature].concat(parent.ancestors())
}

Trace.prototype._parent = function () {
  var prev = this._stackPrevStarted
  while (prev) {
    if (prev.ended && prev._endOrder > this._endOrder) return prev
    prev = prev._stackPrevStarted
  }
  return null
}
