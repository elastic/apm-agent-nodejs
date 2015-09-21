'use strict'

var asyncState = require('../async-state')

var Trace = module.exports = function (transaction, signature, type) {
  this.transaction = transaction
  this.signature = signature
  this.type = type

  this._parent = asyncState.lastTransactionTrace
  asyncState.lastTransactionTrace = this

  this._start = new Date()
  this._hrtime = process.hrtime()
}

Trace.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
}

Trace.prototype.duration = function () {
  if (!this._diff) return -1 // TODO: We could also call end automatically or throw?
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Trace.prototype.startTime = function () {
  var start = this._parent ? this._parent._hrtime : this.transaction._hrtime
  var ns = (this._hrtime[0] - start[0]) * 1e9 + (this._hrtime[1] - start[1])
  return ns / 1e6
}

Trace.prototype.groupingTs = function () {
  if (!this._groupingTs) {
    var d = this._start
    this._groupingTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
  }
  return this._groupingTs
}

Trace.prototype.groupingKey = function () {
  return this.groupingTs().getTime() + '|' + this.transaction.name + '|' + this.signature + '|' + this.type
}

Trace.prototype.ancestors = function () {
  // TODO: Maybe this isn't that performant
  return this._parent ? this._parent.ancestors().concat(this._parent.signature) : []
}
