'use strict'

var Transaction = module.exports = function (buffer, name, type, result) {
  this.name = name
  this.type = type
  this.result = result

  this._buffer = buffer
  this._start = new Date()
  this._hrtime = process.hrtime()
}

Transaction.prototype.end = function () {
  this._diff = process.hrtime(this._hrtime)
  this._buffer.add(this)
}

Transaction.prototype.duration = function () {
  if (!this._diff) return -1 // TODO: We could also call end automatically or throw?
  var ns = this._diff[0] * 1e9 + this._diff[1]
  return ns / 1000000
}

Transaction.prototype.groupingTs = function () {
  if (!this._groupingTs) {
    var d = this._start
    this._groupingTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
  }
  return this._groupingTs
}

Transaction.prototype.groupingKey = function () {
  return this.groupingTs().getTime() + '|' + this.name + '|' + this.result + '|' + this.type
}
