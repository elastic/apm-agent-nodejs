'use strict'
const querystring = require('querystring')

const HEADER_FORM_URLENCODED = 'application/x-www-form-urlencoded'

/**
 * Handles req.body as object, string, or Buffer
 *
 * Express provides multiple body parser middlewares with x-www-form-urlencoded
 * handling.  See http://expressjs.com/en/resources/middleware/body-parser.html
 */
function removeKeysFromPostedFormVariables(body, requestHeaders, regexes) {
  // only remove from application/x-www-form-urlencoded
  if(HEADER_FORM_URLENCODED !== requestHeaders['content-type']) {
    return body
  }

  // and maybe multipart/form-data? (check headers)

  // if body is a plain object, use removeKeysFromObject
  if(null !== body && 'object' === typeof body && !Buffer.isBuffer(body)) {
    return removeKeysFromObject(body, regexes)
  }

  // if body is a string, use querystring to create object,
  // pass to removeKeysFromObject, and reserialize as string
  if(typeof body === 'string') {
    const objBody = querystring.parse(body)
    removeKeysFromObject(objBody, regexes)
    return querystring.stringify(objBody)
  }

  // if body is a buffer, cast to string, use querystring to
  // create object, pass to removeKeysFromObject, and
  // reseriailize as a buffer
  if(Buffer.isBuffer(body)) {
    const objBody = querystring.parse(body.toString())
    removeKeysFromObject(objBody, regexes)
    return querystring.stringify(objBody)
  }

  return body
}

function removeKeyFromObject(obj, regex) {
  for(const [key,] of Object.entries(obj)) {
    if(regex.test(key)) {
      delete obj[key]
    }
  }
  return obj
}

function removeKeysFromObject(obj, regexes) {
  for(const [,regex] of regexes.entries()) {
    removeKeyFromObject(obj, regex)
  }
  return obj
}

function createFilter(conf) {
  return sanitizeFieldNames

  function sanitizeFieldNames(obj) {
    const requestHeaders = obj.context && obj.context.request && obj.context.request.headers
    const responseHeaders = obj.context && obj.context.response && obj.context.response.headers
    let body = obj.context && obj.context.request && obj.context.request.body

    removeKeysFromObject(requestHeaders, conf.sanitizeFieldNamesRegExp)
    removeKeysFromObject(responseHeaders, conf.sanitizeFieldNamesRegExp)

    body = removeKeysFromPostedFormVariables(body, requestHeaders, conf.sanitizeFieldNamesRegExp)

    return obj
  }
}

module.exports = {
  createFilter,
  removeKeysFromObject,
  removeKeysFromPostedFormVariables
}
