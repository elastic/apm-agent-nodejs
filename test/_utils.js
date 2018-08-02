'use strict'

// Return the first element in the array that has a `key` with the given `val`
exports.findObjInArray = function (arr, key, val) {
  let result = null
  arr.some(function (elm) {
    if (elm[key] === val) {
      result = elm
      return true
    }
  })
  return result
}
