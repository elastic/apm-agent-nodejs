'use strict'

var debug = require('debug')('opbeat')
var encode = require('./protocol').encode

var MAX_FLUSH_DELAY = 60000
var MAX_FLUSH_DELAY_ON_BOOT = 5000
var boot = true

module.exports = Queue

function Queue (onFlush) {
  this._onFlush = onFlush
  this._queue = []
  this._timeout = null
}

Queue.prototype.add = function (transaction) {
  this._queue.push(transaction)
  if (!this._timeout) this._queueFlush()
}

Queue.prototype._queueFlush = function () {
  var self = this
  debug('setting timer to flush transaction queue')
  this._timeout = setTimeout(function () {
    self._flush()
  }, boot ? MAX_FLUSH_DELAY_ON_BOOT : MAX_FLUSH_DELAY)
  this._timeout.unref()
  boot = false
}

Queue.prototype._flush = function () {
  debug('flushing transaction queue')
  encode(this._queue, this._onFlush)
  this._clear()
}

Queue.prototype._clear = function () {
  clearTimeout(this._timeout)
  this._timeout = null
  this._queue = []
}
