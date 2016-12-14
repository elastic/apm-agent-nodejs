'use strict'

var redact = require('redact-secrets')('[REDACTED]')

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
  var context = {}
  if (payload.http) context.http = payload.http
  if (payload.user) context.user = payload.user
  if (payload.extra) context.extra = payload.extra

  // abort if a filter function doesn't return an object
  this._filters.some(function (filter) {
    context = filter(context)
    return !context
  })

  if (!context) return
  if (context.http !== payload.http) payload.http = context.http
  if (context.user !== payload.user) payload.user = context.user
  if (context.extra !== payload.extra) payload.extra = context.extra

  return payload
}

function httpHeaders (context) {
  if (context.http) {
    if (context.http.headers && context.http.headers.authorization) {
      context.http.headers.authorization = REDACTED
    }
    if (context.http.cookies) {
      context.http.cookies = redact.map(context.http.cookies)
    }
  }

  return context
}
