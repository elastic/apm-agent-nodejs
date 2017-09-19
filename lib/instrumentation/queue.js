'use strict'

var debug = require('debug')('elastic-apm')
var protocol = require('./protocol')

var MAX_FLUSH_DELAY_ON_BOOT = 5000
var boot = true

module.exports = Queue

function Queue (opts, onFlush) {
  if (typeof opts === 'function') return new Queue(null, opts)
  if (!opts) opts = {}
  this._onFlush = onFlush
  this._transactions = []
  this._timeout = null
  this._flushInterval = (opts.flushInterval || 60) * 1000

  // The purpose of the boot flush time is to be lower than the normal flush
  // time in order to get a result quickly when the app first boots. But if a
  // custom flush interval is provided and it's lower than the boot flush time,
  // it doesn't make much sense anymore. In that case, just pretend we have
  // already used the boot flush time.
  if (this._flushInterval < MAX_FLUSH_DELAY_ON_BOOT) boot = false
}

Queue.prototype.add = function (transaction) {
  this._transactions.push(transaction)
  if (!this._timeout) this._queueFlush()
}

Queue.prototype._queueFlush = function () {
  var self = this
  var ms = boot ? MAX_FLUSH_DELAY_ON_BOOT : this._flushInterval
  debug('setting timer to flush transaction queue: %dms', ms)
  this._timeout = setTimeout(function () {
    self._flush()
  }, ms)
  this._timeout.unref()
  boot = false
}

Queue.prototype._flush = function () {
  debug('flushing transaction queue')
  protocol.encode(this._transactions, this._onFlush)
  this._clear()
}

Queue.prototype._clear = function () {
  clearTimeout(this._timeout)
  this._transactions = []
  this._timeout = null
}
