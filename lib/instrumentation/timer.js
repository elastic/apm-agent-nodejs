'use strict'

var microtime = require('relative-microtime')

module.exports = Timer

// `startTime`: millisecond float
function Timer (timer, startTime) {
  this._timer = timer ? timer._timer : microtime()
  this.start = startTime >= 0 ? startTime * 1000 : this._timer() // microsecond integer
  this.duration = null // millisecond float
}

// `endTime`: millisecond float
Timer.prototype.end = function (endTime) {
  if (this.duration !== null) return
  this.duration = this.elapsed(endTime)
}

// `endTime`: millisecond float
// returns: millisecond float
Timer.prototype.elapsed = function (endTime) {
  return ((endTime >= 0 ? endTime * 1000 : this._timer()) - this.start) / 1000
}
