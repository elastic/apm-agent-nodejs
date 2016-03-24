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
    debug('no current trace found %o', { current: trace, traces: this.traces.length, uuid: this._uuid })
    this.traces = []
  } else if (trace.transaction !== this) {
    debug('transaction is out of sync %o', { traces: this.traces.length, uuid: this._uuid, other: trace.transaction._uuid })
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

  if (!this._agent._instrumentation.currentTrace) {
    if (this._agent._instrumentation._buildTraceFailed) {
      // in case the buildTraceFailed boolean is true, we have no way of
      // knowing if traces are missing between the given trace and the
      // traces already pushed to the stack. In that case it's better to bail
      debug('No current trace available - restore not possible!', { uuid: this._uuid })
      return
    }

    debug('No current trace available - attempting restore', { uuid: this._uuid })
    this._agent._instrumentation.currentTrace = trace
  }

  this.traces.push(trace)
}
