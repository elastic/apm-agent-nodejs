'use strict'

var asyncState = require('../async-state')
var Trace = require('./trace')

var Transaction = module.exports = function (buffer, name, type, result) {
  this.name = name
  this.type = type
  this.result = result

  asyncState.lastTransactionTrace = null

  this._buffer = buffer
  this._start = new Date()
  this._traces = []
  this._hrtime = process.hrtime()
}

Transaction.prototype.end = function () {
  // TODO: Should we check if any traces haven't yet ended and end them automatically?
  this._diff = process.hrtime(this._hrtime)
  this._buffer.add(this)
}

Transaction.prototype.startTrace = function (signature, type) {
  var trace = new Trace(this, signature, type)
  this._traces.push(trace)
  return trace
}

Transaction.prototype.traces = function () {
  return this._traces
}

// TODO: Maybe cache the result?
Transaction.prototype.duration = function () {
  if (!this._diff) return -1 // TODO: We could also call end automatically or throw?
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Transaction.prototype.groupingTs = function () {
  if (!this._groupingTs) {
    var d = this._start
    this._groupingTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
  }
  return this._groupingTs
}

Transaction.prototype.groupingKey = function () {
  return this.groupingTs().getTime() + '|' + this.name + '|' + this.result + '|' + this.type
}
