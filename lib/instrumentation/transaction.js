'use strict'

var uuid = require('node-uuid')
var debug = require('debug')('opbeat')
var Trace = require('./trace')

module.exports = Transaction

function Transaction (agent, name, type, result) {
  Object.defineProperty(this, 'name', {
    configurable: true,
    enumerable: true,
    get: function () {
      return this._customName || this._defaultName
    },
    set: function (name) {
      debug('setting transaction name %o', { uuid: this._uuid, name: name })
      this._customName = name
    }
  })

  this._defaultName = name
  this.type = type
  this.result = result
  this.traces = []
  this.ended = false
  this._uuid = uuid.v4()
  this._agent = agent

  debug('start transaction %o', { uuid: this._uuid, name: name, type: type, result: result })

  // Don't leak traces from previous transactions
  this._agent._instrumentation.currentTrace = null

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = new Trace(this)
  this._rootTrace.start('transaction', 'transaction')
  this._start = this._rootTrace._start
  this.duration = this._rootTrace.duration.bind(this._rootTrace)
}

Transaction.prototype.setDefaultName = function (name) {
  debug('setting default transaction name: %s', name)
  this._defaultName = name
}

Transaction.prototype.end = function () {
  if (this.ended) return debug('cannot end already ended transaction %o', { uuid: this._uuid })

  this._rootTrace.end()
  this.ended = true

  var trace = this._agent._instrumentation.currentTrace

  // These two edge-cases should normally not happen, but if the hooks into
  // Node.js doesn't work as intended it might. In that case we want to
  // gracefully handle it. That involves ignoring all traces under the given
  // transaction as they will most likely be incomplete. We still want to send
  // the transaction without any traces to Opbeat as it's still valuable data.
  if (!trace) {
    debug('no active trace found %o', { uuid: this._uuid })
    this.traces = []
  } else if (trace.transaction !== this) {
    debug('transaction is out of sync %o', { uuid: this._uuid, other: trace.transaction._uuid })
    this.traces = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  debug('ended transaction %o', { uuid: this._uuid, type: this.type, result: this.result })
}

Transaction.prototype._recordEndedTrace = function (trace) {
  if (this.ended) {
    debug('Can\'t record ended trace after parent transaction have ended - ignoring %o', { uuid: this._uuid })
    return
  }

  this.traces.push(trace)
}
