'use strict'

module.exports = Filters

function Filters () {
  if (!(this instanceof Filters)) return new Filters()
  this._filters = []
}

Filters.REDACTED = '[REDACTED]'

Filters.prototype.add = function (fn) {
  this._filters.push(fn)
}

Filters.prototype.process = function (payload) {
  var result = payload

  // abort if a filter function doesn't return an object
  this._filters.some(function (filter) {
    result = filter(result)
    return !result
  })

  return result
}
