'use strict'

var cookie = require('cookie')
var redact = require('redact-secrets')('[REDACTED]')
var SetCookie = require('set-cookie-serde')

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
  var result = payload

  // abort if a filter function doesn't return an object
  this._filters.some(function (filter) {
    result = filter(result)
    return !result
  })

  return result
}

function stringify (value) {
  return Array.isArray(value)
    ? value.map(value => value.toString())
    : value.toString()
}

function httpHeaders (payload) {
  var arr = payload.transactions || payload.errors

  if (!arr || !arr.forEach) return payload

  arr.forEach(function (obj) {
    var headers = obj.context && obj.context.request && obj.context.request.headers

    if (!headers) return

    if (headers.authorization) headers.authorization = REDACTED

    if (typeof headers.cookie === 'string') {
      var cookies = cookie.parse(headers.cookie)
      redact.forEach(cookies)
      headers.cookie = Object.keys(cookies)
        .map(function (k) { return k + '=' + cookies[k] })
        .join('; ')
    }

    if (typeof headers['set-cookie'] !== 'undefined') {
      try {
        var setCookies = new SetCookie(headers['set-cookie'])
        redact.forEach(setCookies)
        headers['set-cookie'] = stringify(setCookies)
      } catch (err) {
        // Ignore error
        headers['set-cookie'] = '[malformed set-cookie header]'
      }
    }
  })

  return payload
}
