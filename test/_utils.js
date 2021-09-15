'use strict'

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

module.exports = {
  dottedLookup,
  findObjInArray
}
