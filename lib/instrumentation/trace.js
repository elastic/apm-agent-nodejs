'use strict'

var Trace = module.exports = function (transaction, signature, type) {
  this.transaction = transaction
  this.signature = signature
  this.type = type
  this.ended = false

  this._client = transaction._client
  this._prevTrace = this.transaction._latestTrace
  this._start = new Date()
  this._hrtime = process.hrtime()

  this._client.logger.trace('[%s] start trace (signature: %s, type: %s)', this.transaction._uuid, signature, type)
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
  this._client.logger.trace('[%s] ended trace (signature: %s, type: %s)', this.transaction._uuid, this.signature, this.type)
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    this._client.logger.error('[%s] Trying to call trace.duration() on un-ended Trace!', this.transaction._uuid)
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    this._client.logger.error('[%s] Trying to call trace.startTime() for un-ended Trace/Transaction!', this.transaction._uuid)
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
    this._client.logger.error('[%s] Trying to call trace.ancestors() for un-ended Trace/Transaction!', this.transaction._uuid)
    return null
  }

  var parent = this._parent()
  if (!parent) return []
  return parent.ancestors().concat(parent.signature)
}

Trace.prototype._parent = function () {
  var prev = this._prevTrace
  while (prev) {
    if (prev.ended && prev._endOrder > this._endOrder) return prev
    prev = prev._prevTrace
  }
  return null
}
