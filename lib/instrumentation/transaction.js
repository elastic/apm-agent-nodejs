'use strict'

var uuid = require('node-uuid')
var asyncState = require('../async-state')
var Trace = require('./trace')

var Transaction = module.exports = function (client, name, type, result) {
  this.name = name
  this.type = type
  this.result = result
  this.traces = []
  this.ended = false
  this._uuid = uuid.v4()

  asyncState.lastTransactionTraceStarted = null

  this._client = client

  // Keep track of which traces overlap other traces. Contains start/stop
  // events in form of arrays: `[Boolean, Trace]`. The `Boolean` is false if
  // the Trace just started and true if it just ended.
  this._tracesStartStopOrder = []

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = this.startTrace('transaction', 'transaction')
  this._start = this._rootTrace._start
  this.duration = this._rootTrace.duration.bind(this._rootTrace)

  this._client.logger.trace('[%s] starting transaction (name: %s, type: %s, result: %s)', this._uuid, name, type, result)
}

Transaction.prototype.end = function () {
  this._rootTrace.end()
  this.ended = true
  this._client._instrumentation.add(this)
  this._client.logger.trace('[%s] ended transaction (type: %s, result: %s)', this._uuid, this.type, this.result)
}

Transaction.prototype.startTrace = function (signature, type) {
  var trace = new Trace(this, signature, type)
  this._tracesStartStopOrder.push([false, trace])
  return trace
}

Transaction.prototype._recordEndedTrace = function (trace) {
  if (this.ended) {
    this._client.logger.error('[%s] Can\'t record ended trace after parent transaction have ended - ignoring!', this._uuid)
    return
  }

  this._tracesStartStopOrder.push([true, trace])
  this.traces.push(trace)

  // a simple way to compare two traces within a Transaction and see if one
  // ended before or after another
  trace._endOrder = this._tracesStartStopOrder.length
}
