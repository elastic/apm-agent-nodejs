'use strict'

const REDACTED = require('./').REDACTED

const cookie = require('cookie')
const redact = require('redact-secrets')(REDACTED)
const SetCookie = require('set-cookie-serde')

module.exports = httpHeaders

function httpHeaders (obj) {
  const headers = obj.context && obj.context.request && obj.context.request.headers

  if (!headers) return obj

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

  return obj
}

function stringify (value) {
  return Array.isArray(value)
    ? value.map(value => value.toString())
    : value.toString()
}
