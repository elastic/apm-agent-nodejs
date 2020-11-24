'use strict'

const REDACTED = '[REDACTED]'

const cookie = require('cookie')
const redact = require('redact-secrets')(REDACTED)
const SetCookie = require('set-cookie-serde')

module.exports = httpHeaders

function httpHeaders (obj) {
  const requestHeaders = obj.context && obj.context.request && obj.context.request.headers
  const responseHeaders = obj.context && obj.context.response && obj.context.response.headers

  if (requestHeaders) filterSensitiveHeaders(requestHeaders)
  if (responseHeaders) filterSensitiveHeaders(responseHeaders)

  return obj
}

function filterSensitiveHeaders (headers) {
  for (const key in headers) {
    switch (key.toLowerCase()) {
      case 'authorization':
        headers[key] = REDACTED
        break
      case 'cookie':
        if (typeof headers[key] === 'string') {
          const cookies = cookie.parse(headers[key])
          redact.forEach(cookies)
          headers[key] = Object.keys(cookies)
            .map(k => k + '=' + cookies[k])
            .join('; ')
        }
        break
      case 'set-cookie':
        if (typeof headers[key] !== 'undefined') {
          try {
            const setCookies = new SetCookie(headers[key])
            redact.forEach(setCookies)
            headers[key] = stringify(setCookies)
          } catch (err) {
            // Ignore error
            headers[key] = '[malformed set-cookie header]'
          }
        }
        break
    }
  }
}

function stringify (value) {
  return Array.isArray(value)
    ? value.map(value => value.toString())
    : value.toString()
}
