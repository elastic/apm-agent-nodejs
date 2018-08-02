'use strict'

// The mock client will call the `done` callback with the written data once the
// `expected` number of writes have occurrd.
//
// In case the caller don't know how many writes will happen, they can omit the
// `expected` argument. When the `expected` arguemnt is missing, the mock
// client will instead call the `done` callback when no new spans have been
// written after a given delay (controlled by the `resetTimer` below).
module.exports = function (expected, done) {
  const timerBased = typeof expected === 'function'
  if (timerBased) done = expected
  let timer

  const client = {
    _writes: { length: 0, spans: [], transactions: [], errors: [] },
    _write (obj, cb) {
      cb = cb || noop

      const type = Object.keys(obj)[0]
      this._writes.length++
      this._writes[type + 's'].push(obj[type])

      process.nextTick(cb)

      if (timerBased) resetTimer()
      else if (this._writes.length === expected) done(this._writes)
      else if (this._writes.length > expected) throw new Error('too many writes')
    },
    sendSpan (span, cb) {
      this._write({ span }, cb)
    },
    sendTransaction (transaction, cb) {
      this._write({ transaction }, cb)
    },
    sendError (error, cb) {
      this._write({ error }, cb)
    },
    flush (cb) {
      if (cb) process.nextTick(cb)
    }
  }

  return client

  function resetTimer () {
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () {
      done(client._writes)
    }, 100)
  }
}

function noop () {}
