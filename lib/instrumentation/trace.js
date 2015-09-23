'use strict'

var asyncState = require('../async-state')

var Trace = module.exports = function (transaction, signature, type) {
  this.transaction = transaction
  this.signature = signature
  this.type = type

  this._stackPrevStarted = asyncState.lastTransactionTraceStarted
  asyncState.lastTransactionTraceStarted = this

  this._start = new Date()
  this._hrtime = process.hrtime()
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
  this._stackPrevEnded = asyncState.lastTransactionTraceEnded
  asyncState.lastTransactionTraceEnded = this
}

Trace.prototype.duration = function () {
  if (!this._diff) return -1 // TODO: We could also call end automatically or throw?
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  var parent = this.parent()
  var start = parent ? parent._hrtime : this.transaction._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  var parent = this.parent()
  if (!parent) return []
  return [parent.signature].concat(parent.ancestors())
}

Trace.prototype.parent = function () {
  var prev = this._stackPrevStarted
  while (prev) {
    if (prev.isDecendant(this)) return prev
    prev = prev._stackPrevStarted
  }
  return null
}

Trace.prototype.isDecendant = function (trace) {
  var prev = this._stackPrevEnded
  while (prev) {
    if (prev === trace) return true
    prev = prev._stackPrevEnded
  }
  return false
}
