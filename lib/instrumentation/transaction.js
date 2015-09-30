'use strict'

var asyncState = require('../async-state')
var Trace = require('./trace')

var Transaction = module.exports = function (queue, name, type, result) {
  this.name = name
  this.type = type
  this.result = result
  this.traces = []
  this.ended = false

  asyncState.lastTransactionTraceStarted = null
  asyncState.lastTransactionTraceEnded = null

  this._queue = queue

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = this.startTrace('transaction', 'transaction')
  this._start = this._rootTrace._start
  this.duration = this._rootTrace.duration.bind(this._rootTrace)
}

Transaction.prototype.end = function () {
  this._rootTrace.end()
  this.ended = true
  this._queue.add(this)
}

Transaction.prototype.startTrace = function (signature, type) {
  var trace = new Trace(this, signature, type)
  return trace
}

Transaction.prototype._endTrace = function (trace) {
  if (this.ended) {
    // TODO: Use the opbeat logger
    console.error('Can\'t end trace after parent transaction have ended - ignoring!')
    return
  }

  this.traces.push(trace)
}
