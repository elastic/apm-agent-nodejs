'use strict'

const assert = require('assert')

// https://w3c.github.io/baggage/
//
// Borrow from https://open-telemetry.github.io/opentelemetry-js/interfaces/baggage.html ?
// Warning: This isn't currently doing the "Baggage is immutable" thing.
//
// For now this is a quick hack that serializes as JSON object. Entry metadata
// is not yet supported.
//
// TODO: actual defensive programming and actual w3c serialization.
class Baggage {
  constructor (baggageString) {
    if (baggageString === null || baggageString === undefined) {
      this._entries = {}
      return
    } else if (typeof baggageString !== 'string') {
      throw new Error('invalid baggageString type: ' + typeof baggageString)
    }

    const s = baggageString.trim()
    if (s.length === 0) {
      this._entries = {}
      return
    } else if (!s.startsWith('{')) {
      throw new Error('invalid baggageString, is not a JSON object: ' + s)
    }

    try {
      this._entries = JSON.parse(baggageString)
    } catch (parseErr) {
      throw new Error('invalid baggageString, is not JSON: ' + parseErr)
    }
  }

  toString () {
    if (Object.keys(this._entries).length === 0) {
      return null
    } else {
      return JSON.stringify(this._entries)
    }
  }

  clear () {
    this._entries = {}
  }

  setEntry (key, entry) {
    assert(typeof key === 'string', 'invalid Baggage entry key type')
    assert(typeof entry === 'string', 'invalid Baggage entry type')
    this._entries[key] = entry
  }

  getEntry (key) {
    assert(typeof key === 'string', 'invalid Baggage entry key type')
    return this._entries[key]
  }

  removeEntry (key) {
    assert(typeof key === 'string', 'invalid Baggage entry key type')
    delete this._entries[key]
  }
}

module.exports = {
  Baggage
}
