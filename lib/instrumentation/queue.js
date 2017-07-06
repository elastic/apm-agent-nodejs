'use strict'

var debug = require('debug')('opbeat')
var protocol = require('./protocol')

var MAX_FLUSH_DELAY_ON_BOOT = 5000
var boot = true

module.exports = Queue

function Queue (opts, onFlush) {
  if (typeof opts === 'function') return new Queue(null, opts)
  if (!opts) opts = {}
  this._onFlush = onFlush
  this._samples = []
  this._sampled = {}
  this._timeout = null
  this._flushInterval = (opts.flushInterval || 60) * 1000
}

Queue.prototype.add = function (transaction) {
  var key = sampleKey(transaction)
  if (!(key in this._sampled)) {
    this._sampled[key] = true
    this._samples.push(transaction)
  }
  if (!this._timeout) this._queueFlush()
}

Queue.prototype._queueFlush = function () {
  var self = this
  debug('setting timer to flush transaction queue')
  this._timeout = setTimeout(function () {
    self._flush()
  }, boot ? MAX_FLUSH_DELAY_ON_BOOT : this._flushInterval)
  this._timeout.unref()
  boot = false
}

Queue.prototype._flush = function () {
  debug('flushing transaction queue')
  protocol.encode(this._samples, this._onFlush)
  this._clear()
}

Queue.prototype._clear = function () {
  clearTimeout(this._timeout)
  this._samples = []
  this._sampled = {}
  this._timeout = null
}

function sampleKey (trans) {
  var durationBucket = Math.floor(trans.duration() / 15)
  return durationBucket + '|' + trans.type + '|' + trans.name
}
