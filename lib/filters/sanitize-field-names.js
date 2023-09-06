/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const querystring = require('querystring');

const HEADER_FORM_URLENCODED = 'application/x-www-form-urlencoded';
const REDACTED = require('../constants').REDACTED;

/**
 * Handles req.body as object or string
 *
 * Express provides multiple body parser middlewares with x-www-form-urlencoded
 * handling.  See http://expressjs.com/en/resources/middleware/body-parser.html
 *
 * @param {Object | String} body
 * @param {Object} requestHeaders
 * @param {Array<RegExp>} regexes
 * @returns {Object | String} a copy of the body with the redacted fields
 */
function redactKeysFromPostedFormVariables(body, requestHeaders, regexes) {
  // only redact from application/x-www-form-urlencoded
  if (HEADER_FORM_URLENCODED !== requestHeaders['content-type']) {
    return body;
  }

  // if body is a plain object, use redactKeysFromObject
  if (body !== null && !Buffer.isBuffer(body) && typeof body === 'object') {
    return redactKeysFromObject(body, regexes);
  }

  // if body is a string, use querystring to create object,
  // pass to redactKeysFromObject, and reserialize as string
  if (typeof body === 'string') {
    const objBody = redactKeysFromObject(querystring.parse(body), regexes);
    return querystring.stringify(objBody);
  }

  return body;
}

/**
 * Returns a copy of the provided object. Each entry of the copy will have
 * its value REDACTEd if the key matches any of the regexes
 *
 * @param {Object} obj The source object be copied with redacted fields
 * @param {Array<RegExp>} regexes RegExps to check if the entry value needd to be redacted
 * @returns {Object} Copy of the source object with REDACTED entries or the original if falsy or regexes is not an array
 */
function redactKeysFromObject(obj, regexes) {
  if (!obj || !Array.isArray(regexes)) {
    return obj;
  }
  const result = {};
  for (const key of Object.keys(obj)) {
    const shouldRedact = regexes.some((regex) => regex.test(key));
    result[key] = shouldRedact ? REDACTED : obj[key];
  }
  return result;
}

module.exports = {
  redactKeysFromObject,
  redactKeysFromPostedFormVariables,
};
