'use strict'

module.exports = Timer

function Timer () {
  this.ended = false
  this.start = Date.now()
  this._hrtime = process.hrtime()
  this._diff = null
}

Timer.prototype.end = function () {
  if (this.ended) return
  this._diff = process.hrtime(this._hrtime)
  this.ended = true
}

Timer.prototype.duration = function () {
  if (!this.ended) return null
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1e6
}

Timer.prototype.offset = function (timer) {
  var a = timer._hrtime
  var b = this._hrtime
  var ns = (b[0] - a[0]) * 1e9 + (b[1] - a[1])
  return ns / 1e6
}
