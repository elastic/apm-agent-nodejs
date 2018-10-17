'use strict'

var microtime = require('relative-microtime')

module.exports = Timer

function Timer (timer) {
  this._timer = timer ? timer._timer : microtime()
  this.start = this._timer()
  this.duration = null
}

Timer.prototype.end = function () {
  if (this.duration !== null) return
  this.duration = this.elapsed()
}

Timer.prototype.elapsed = function () {
  // durations are in milliseconds ¯\_(ツ)_/¯
  return (this._timer() - this.start) / 1000
}
