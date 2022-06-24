/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

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

// Return the first element in the array that has a `key` with the given `val`.
//
// The `key` maybe a nested field given in dot-notation, for example:
// 'context.db.statement'.
function findObjInArray (arr, key, val) {
  let result = null
  arr.some(function (elm) {
    if (dottedLookup(elm, key) === val) {
      result = elm
      return true
    }
  })
  return result
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

module.exports = {
  dottedLookup,
  findObjInArray,
  safeGetPackageVersion
}
