'use strict'

var debug = require('debug')('elastic-apm')

var MAX_FLUSH_DELAY_ON_BOOT = 5000
var boot = true

module.exports = Queue

function Queue (opts, onFlush) {
  if (typeof opts === 'function') return new Queue(null, opts)
  if (!opts) opts = {}
  this._onFlush = onFlush
  this._items = []
  this._timeout = null
  this._flushInterval = (opts.flushInterval || 60) * 1000
  this._maxQueueSize = Number.isSafeInteger(opts.maxQueueSize) && opts.maxQueueSize >= -1
    ? opts.maxQueueSize
    : -1

  // The purpose of the boot flush time is to be lower than the normal flush
  // time in order to get a result quickly when the app first boots. But if a
  // custom flush interval is provided and it's lower than the boot flush time,
  // it doesn't make much sense anymore. In that case, just pretend we have
  // already used the boot flush time.
  if (this._flushInterval < MAX_FLUSH_DELAY_ON_BOOT) boot = false
}

Queue.prototype.add = function (obj) {
  this._items.push(obj)
  if (this._maxQueueSize !== -1 && this._items.length >= this._maxQueueSize) this._flush()
  else if (!this._timeout) this._queueFlush()
}

Queue.prototype._queueFlush = function () {
  var self = this
  var ms = boot ? MAX_FLUSH_DELAY_ON_BOOT : this._flushInterval

  // Randomize flush time to avoid servers started at the same time to
  // all connect to the APM server simultaneously
  ms = fuzzy(ms, 0.05) // +/- 5%

  debug('setting timer to flush queue: %dms', ms)
  this._timeout = setTimeout(function () {
    self._flush()
  }, ms)
  this._timeout.unref()
  boot = false
}

Queue.prototype._flush = function () {
  debug('flushing queue')
  this._onFlush(this._items)
  this._clear()
}

Queue.prototype._clear = function () {
  clearTimeout(this._timeout)
  this._items = []
  this._timeout = null
}

// TODO: Check if there's an existing algorithm for this we can use instead
function fuzzy (n, pct) {
  var variance = n * pct * 2
  return Math.floor(n + (Math.random() * variance - variance / 2))
}
