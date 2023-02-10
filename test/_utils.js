/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// A dumping ground for testing utility functions.

const fs = require('fs')

const moduleDetailsFromPath = require('module-details-from-path')

// Lookup the property "str" (given in dot-notation) in the object "obj".
// If the property isn't found, then `undefined` is returned.
function dottedLookup (obj, str) {
  var o = obj
  var fields = str.split('.')
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i]
    if (!Object.prototype.hasOwnProperty.call(o, field)) {
      return undefined
    }
    o = o[field]
  }
  return o
}

// Return the first element in the array that has a `key` with the given `val`;
// or if `val` is undefined, then the first element with any value for the given
// `key`.
//
// The `key` maybe a nested field given in dot-notation, for example:
// 'context.db.statement'.
function findObjInArray (arr, key, val) {
  let result = null
  arr.some(function (elm) {
    const actualVal = dottedLookup(elm, key)
    if (val === undefined) {
      if (actualVal !== undefined) {
        result = elm
        return true
      }
    } else {
      if (actualVal === val) {
        result = elm
        return true
      }
    }
  })
  return result
}

// Same as `findObjInArray` but return all matches instead of just the first.
function findObjsInArray (arr, key, val) {
  return arr.filter(function (elm) {
    const actualVal = dottedLookup(elm, key)
    if (val === undefined) {
      if (actualVal !== undefined) {
        return true
      }
    } else {
      if (actualVal === val) {
        return true
      }
    }
    return false
  })
}

// "Safely" get the version of the given package, if possible. Otherwise return
// null.
//
// Here "safely" means avoiding `require("$packageName/package.json")` because
// that can fail if the package uses an old form of "exports"
// (e.g. https://github.com/elastic/apm-agent-nodejs/issues/2350).
function safeGetPackageVersion (packageName) {
  let file
  try {
    file = require.resolve(packageName)
  } catch (_err) {
    return null
  }

  // Use the same logic as require-in-the-middle for finding the 'basedir' of
  // the package from `file`.
  const details = moduleDetailsFromPath(file)
  if (!details) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(details.basedir + '/package.json')).version
  } catch (_err) {
    return null
  }
}

// Match ANSI escapes (from https://stackoverflow.com/a/29497680/14444044).
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g /* eslint-disable-line no-control-regex */

/**
 * Format the given data for passing to `t.comment()`.
 *
 * - t.comment() wipes leading whitespace. Prefix lines with '|' to avoid
 *   that, and to visually group a multi-line write.
 * - Drop ANSI escape characters, because those include control chars that
 *   are illegal in XML. When we convert TAP output to JUnit XML for
 *   Jenkins, then Jenkins complains about invalid XML. `FORCE_COLOR=0`
 *   can be used to disable ANSI escapes in `next dev`'s usage of chalk,
 *   but not in its coloured exception output.
 */
function formatForTComment (data) {
  return data.toString('utf8')
    .replace(ANSI_RE, '')
    .trimRight().replace(/\r?\n/g, '\n|') + '\n'
}

module.exports = {
  dottedLookup,
  findObjInArray,
  findObjsInArray,
  formatForTComment,
  safeGetPackageVersion
}
