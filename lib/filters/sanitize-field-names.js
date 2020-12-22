'use strict'
const querystring = require('querystring')

const HEADER_FORM_URLENCODED = 'application/x-www-form-urlencoded'
const REDACTED = require('../constants').REDACTED

/**
 * Handles req.body as object or string
 *
 * Express provides multiple body parser middlewares with x-www-form-urlencoded
 * handling.  See http://expressjs.com/en/resources/middleware/body-parser.html
 */
function redactKeysFromPostedFormVariables (body, requestHeaders, regexes) {
  // only redact from application/x-www-form-urlencoded
  if (HEADER_FORM_URLENCODED !== requestHeaders['content-type']) {
    return body
  }

  // if body is a plain object, use redactKeysFromObject
  if (body !== null && !Buffer.isBuffer(body) && typeof body === 'object') {
    return redactKeysFromObject(body, regexes)
  }

  // if body is a string, use querystring to create object,
  // pass to redactKeysFromObject, and reserialize as string
  if (typeof body === 'string') {
    const objBody = querystring.parse(body)
    redactKeysFromObject(objBody, regexes)
    return querystring.stringify(objBody)
  }

  return body
}

function redactKeyFromObject (obj, regex) {
  for (const [key] of Object.entries(obj)) {
    if (regex.test(key)) {
      obj[key] = REDACTED
    }
  }
  return obj
}

function redactKeysFromObject (obj, regexes) {
  if (!obj || !Array.isArray(regexes)) {
    return obj
  }
  for (const [, regex] of regexes.entries()) {
    redactKeyFromObject(obj, regex)
  }
  return obj
}

function createFilter (conf) {
  return sanitizeFieldNames

  function sanitizeFieldNames (obj) {
    const requestHeaders = obj.context && obj.context.request && obj.context.request.headers
    const responseHeaders = obj.context && obj.context.response && obj.context.response.headers
    const body = obj.context && obj.context.request && obj.context.request.body

    redactKeysFromObject(requestHeaders, conf.sanitizeFieldNamesRegExp)
    redactKeysFromObject(responseHeaders, conf.sanitizeFieldNamesRegExp)

    if (body) {
      obj.context.request.body = redactKeysFromPostedFormVariables(body, requestHeaders, conf.sanitizeFieldNamesRegExp)
    }

    return obj
  }
}

module.exports = {
  createFilter,
  redactKeysFromObject,
  redactKeysFromPostedFormVariables
}
