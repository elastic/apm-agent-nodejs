'use strict'

var REDACTED = '[REDACTED]'

module.exports = Filters

function Filters () {
  if (!(this instanceof Filters)) return new Filters()
  this._filters = []
}

Filters.prototype.config = function (opts) {
  if (opts.filterHttpHeaders) this.add(httpHeaders)
}

Filters.prototype.add = function (fn) {
  this._filters.push(fn)
}

Filters.prototype.process = function (payload) {
  var data = {}
  if (payload.http) data.http = payload.http
  if (payload.user) data.user = payload.user
  if (payload.extra) data.extra = payload.extra

  // abort if a filter function doesn't return an object
  this._filters.some(function (filter) {
    data = filter(data)
    return !data
  })

  if (!data) return
  if (data.http !== payload.http) payload.http = data.http
  if (data.user !== payload.user) payload.user = data.user
  if (data.extra !== payload.extra) payload.extra = data.extra

  return payload
}

function httpHeaders (payload) {
  if (payload.http && payload.http.headers && payload.http.headers.authorization) {
    payload.http.headers.authorization = REDACTED
  }

  return payload
}
