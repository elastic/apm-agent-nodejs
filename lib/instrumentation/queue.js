'use strict'

var debug = require('debug')('opbeat')
var protocol = require('./protocol')

var MAX_FLUSH_DELAY = 60000
var MAX_FLUSH_DELAY_ON_BOOT = 5000
var boot = true

module.exports = Queue

function Queue (onFlush) {
  this._onFlush = onFlush
  this._samples = []
  this._sampled = {}
  this._durations = {}
  this._timeout = null
}

Queue.prototype.add = function (transaction) {
  var k1 = protocol.transactionGroupingKey(transaction)
  var k2 = sampleKey(transaction)

  if (k1 in this._durations) {
    this._durations[k1].push(transaction.duration())
  } else {
    this._durations[k1] = [transaction.duration()]
  }

  if (!(k2 in this._sampled)) {
    this._sampled[k2] = true
    this._samples.push(transaction)
  }

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
  protocol.encode(this._samples, this._durations, this._onFlush)
  this._clear()
}

Queue.prototype._clear = function () {
  clearTimeout(this._timeout)
  this._samples = []
  this._sampled = {}
  this._durations = {}
  this._timeout = null
}

function sampleKey (trans) {
  var durationBucket = Math.floor(trans.duration() / 15)
  return durationBucket + '|' + trans.name
}
