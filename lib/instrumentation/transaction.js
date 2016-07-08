'use strict'

var uuid = require('node-uuid')
var debug = require('debug')('opbeat')
var Trace = require('./trace')

var TIMEOUT_RESULT = 500
var TIMEOUT_MIN_THRESHOLD = 25000
var SOCKET_CLOSED_TIMEOUT = 120000

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

  this._defaultName = name || ''
  this._customName = ''
  this.type = type
  this.result = result
  this.traces = []
  this.ended = false
  this._timeout = false
  this._prefinished = false
  this._endTimer = null
  this._abortTime = 0
  this._uuid = uuid.v4()
  this._agent = agent
  this._agent._instrumentation.currentTransaction = this

  debug('start transaction %o', { uuid: this._uuid, name: name, type: type, result: result })

  // A transaction should always have a root trace spanning the entire
  // transaction.
  this._rootTrace = new Trace(this)
  this._rootTrace.start('transaction', 'transaction')
  this._start = this._rootTrace._start
  this.duration = this._rootTrace.duration.bind(this._rootTrace)
}

Transaction.prototype._aborted = function () {
  if (this.ended) return debug('cannot call _aborted an already ended transaction %o', { uuid: this._uuid })

  this._abortTime = Date.now() - this._rootTrace._start

  clearTimeout(this._endTimer)
  this._endTimer = setTimeout(function (trans) {
    // We only reach this point if it's a client side timeout and `res.end()`
    // isn't called within 2 minutes
    if (trans._abortTime > TIMEOUT_MIN_THRESHOLD) {
      trans._agent.captureError('Transaction timeout', { extra: {
        endCalled: false,
        serverTimeout: false,
        abortTime: trans._abortTime
      }})
      trans.result = TIMEOUT_RESULT
    }
    trans.timeout()
  }, SOCKET_CLOSED_TIMEOUT, this).unref()
}

Transaction.prototype._prefinish = function () {
  if (this.ended) return debug('cannot call _prefinish an already ended transaction %o', { uuid: this._uuid })

  this._prefinished = true

  if (this._abortTime) {
    // `this._abortTime` is set for both server and client-side timeouts, but
    // server-side timeouts will set the `this.ended` boolean to true wihtin
    // the same tick, so we'll only reach this point if it's a client side
    // timeout and `res.end()` was called
    clearTimeout(this._endTimer)

    if (this._abortTime > TIMEOUT_MIN_THRESHOLD) {
      this._agent.captureError('Transaction timeout', { extra: {
        endCalled: true,
        serverTimeout: false,
        abortTime: this._abortTime
      }})
    }

    this.timeout()
  }
}

Transaction.prototype.timeout = function () {
  if (this.ended) return debug('cannot time out an already ended transaction %o', { uuid: this._uuid })

  if (!this._prefinished && (this._endTimer || !this._endTimer._called)) {
    // it's a server-side timeout
    this._agent.captureError('Transaction timeout', { extra: {
      serverTimeout: true
    }})
    this.result = TIMEOUT_RESULT
  }

  this._timeout = true
  this.end()
}

Transaction.prototype.setDefaultName = function (name) {
  debug('setting default transaction name: %s %o', name, { uuid: this._uuid })
  this._defaultName = name
}

Transaction.prototype.end = function () {
  if (this.ended) return debug('cannot end already ended transaction %o', { uuid: this._uuid, timeout: this._timeout })

  clearTimeout(this._endTimer)

  this._rootTrace.softEnd()
  this.ended = true

  var trans = this._agent._instrumentation.currentTransaction

  // These two edge-cases should normally not happen, but if the hooks into
  // Node.js doesn't work as intended it might. In that case we want to
  // gracefully handle it. That involves ignoring all traces under the given
  // transaction as they will most likely be incomplete. We still want to send
  // the transaction without any traces to Opbeat as it's still valuable data.
  if (!trans) {
    debug('WARNING: no currentTransaction found %o', { current: trans, traces: this.traces.length, uuid: this._uuid })
    this.traces = []
  } else if (trans !== this) {
    debug('WARNING: transaction is out of sync %o', { traces: this.traces.length, uuid: this._uuid, other: trans._uuid })
    this.traces = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  debug('ended transaction %o', { uuid: this._uuid, type: this.type, result: this.result, name: this.name, timeout: this._timeout })
}

Transaction.prototype._recordEndedTrace = function (trace) {
  if (this.ended) {
    debug('Can\'t record ended trace after parent transaction have ended - ignoring %o', { uuid: this._uuid, trace: trace.signature })
    return
  }

  this.traces.push(trace)
}
