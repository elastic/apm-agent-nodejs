'use strict'

var stackCache = require('lru-cache')({ max: 5000 })

var Trace = module.exports = function (transaction) {
  this.transaction = transaction
  this.ended = false
  this._agent = this.transaction._agent
  this._parent = transaction._rootTrace
  this._agent._instrumentation.currentTrace = this

  this._agent.logger.trace('[%s] init trace', this.transaction._uuid)
}

Trace.prototype.start = function (signature, type) {
  this.signature = signature
  this.type = type

  this._recordStackTrace()

  this._start = new Date()
  this._hrtime = process.hrtime()
  this._agent.logger.trace('[%s] start trace (signature: %s, type: %s)', this.transaction._uuid, signature, type)
}

Trace.prototype._recordStackTrace = function () {
  var key = this._stacktraceGroupingKey()
  this._stackObj = stackCache.get(key)
  if (!this._stackObj) {
    var err = {}
    Error.captureStackTrace(err, this)
    this._stackObj = { err: err }
    stackCache.set(key, this._stackObj)
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
  this._agent.logger.trace('[%s] ended trace (signature: %s, type: %s)', this.transaction._uuid, this.signature, this.type)
  this.transaction._recordEndedTrace(this)
}

Trace.prototype.duration = function () {
  if (!this.ended) {
    this._agent.logger.error('[%s] Trying to call trace.duration() on un-ended Trace!', this.transaction._uuid)
    return null
  }

  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  if (!this.ended || !this.transaction.ended) {
    this._agent.logger.error('[%s] Trying to call trace.startTime() for un-ended Trace/Transaction!', this.transaction._uuid)
    return null
  }

  if (!this._parent) return 0
  var start = this._parent._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.ancestors = function () {
  if (!this.ended || !this.transaction.ended) {
    this._agent.logger.error('[%s] Trying to call trace.ancestors() for un-ended Trace/Transaction!', this.transaction._uuid)
    return null
  }

  if (!this._parent) return []
  return this._parent.ancestors().concat(this._parent.signature)
}
