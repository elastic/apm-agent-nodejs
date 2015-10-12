'use strict'

var asyncState = require('../async-state')

var Trace = module.exports = function (transaction, signature, type) {
  this.transaction = transaction
  this.signature = signature || 'unknown'
  this.type = type || 'unknown'
  this.ended = false

  this._stackPrevStarted = asyncState.lastTransactionTraceStarted
  asyncState.lastTransactionTraceStarted = this

  this._client = transaction._client
  this._start = new Date()
  this._hrtime = process.hrtime()
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
  this.transaction._endTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    this._client.logger.error('Trying to call trace.duration() on un-ended Trace!')
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    this._client.logger.error('Trying to call trace.startTime() for un-ended Trace/Transaction!')
    return null
  }

  var parent = this._parent()
  if (!parent) return 0
  var start = parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  if (!this.ended || !this.transaction.ended) {
    this._client.logger.error('Trying to call trace.ancestors() for un-ended Trace/Transaction!')
    return null
  }

  var parent = this._parent()
  if (!parent) return []
  return parent.ancestors().concat(parent.signature)
}

Trace.prototype._parent = function () {
  var prev = this._stackPrevStarted
  while (prev) {
    if (prev.ended && prev._endOrder > this._endOrder) return prev
    prev = prev._stackPrevStarted
  }
  return null
}
