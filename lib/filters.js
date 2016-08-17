'use strict'

var REDACTED = '[REDACTED]'

exports.httpHeaders = function httpHeaders (payload) {
  if (payload.http && payload.http.headers && payload.http.headers.authorization) {
    payload.http.headers.authorization = REDACTED
  }

  return payload
}
