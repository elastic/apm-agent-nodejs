'use strict'

var uuid = require('node-uuid')
var logger = require('../logger')
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
      logger.trace('[%s] setting transaction name: %s', this._uuid, name)
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

  logger.trace('[%s] start transaction (name: %s, type: %s, result: %s)', this._uuid, name, type, result)

  // Don't leak traces from previous transactions
  this._agent._instrumentation.currentTrace = null

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = new Trace(this)
  this._rootTrace.start('transaction', 'transaction')
  this._start = this._rootTrace._start
  this.duration = this._rootTrace.duration.bind(this._rootTrace)
}

Transaction.prototype.end = function () {
  if (this.ended) return logger.warn('[%s] cannot end already ended transaction', this._uuid)

  this._rootTrace.end()
  this.ended = true

  var trace = this._agent._instrumentation.currentTrace
  if (!trace || trace.transaction !== this) {
    // This should normally not happen, but if the hooks into Node.js doesn't
    // work as intended it might. In that case we want to gracefully handle it.
    // That involves ignoring all traces under the given transaction as they
    // will most likely be incomplete. We still want to send the transaction
    // without any traces to Opbeat as it's still valuable data.
    logger.warn('[%s] transaction is out of sync', this._uuid)
    this.traces = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  logger.trace('[%s] ended transaction (type: %s, result: %s)', this._uuid, this.type, this.result)
}

Transaction.prototype._recordEndedTrace = function (trace) {
  if (this.ended) {
    logger.error('[%s] Can\'t record ended trace after parent transaction have ended - ignoring!', this._uuid)
    return
  }

  this.traces.push(trace)
}
