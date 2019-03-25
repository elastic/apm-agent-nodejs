'use strict'

// TODO: Move to a separate module
const arrays = Symbol('sets')

function ensureArray (arrays, key) {
  const array = arrays[key]
  if (array) return array

  arrays[key] = []
  return arrays[key]
}

class NamedArray {
  constructor () {
    this[arrays] = {}
  }

  get keys () {
    return Object.keys(this[arrays])
  }

  add (key, value) {
    return ensureArray(this[arrays], key).push(value)
  }

  clear (key) {
    if (this.has(key)) {
      delete this[arrays][key]
    }
  }

  delete (key, value) {
    const array = this.get(key)
    if (array) {
      const index = array.indexOf(value)
      array.splice(index, 1)
      if (!array.length) {
        this.clear(key)
      }
    }
  }

  has (key) {
    return key in this[arrays]
  }

  get (key) {
    return this[arrays][key]
  }
}

module.exports = NamedArray
