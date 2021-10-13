/* eslint-disable */

// A `Set` object used to track inflight ended APM events; typically spans
// that have ended, but not yet finished encoding into a span event object and
// sent to the transport (the APM server client).
//
// `setDrainHandler` allows setting a function to be called when the inflight
// events have drained. Instrumentation#flush() uses this to ensure that a
// flush returns only when currently ended APM events have been processed.
class InflightEventSet extends Set {
  // Set a `fn` to be called *once* when the set size next goes to zero.
  // If the optional `timeoutMs` is given, the fn will be called then, if the
  // set hasn't yet drained.
  setDrainHandler (fn, timeoutMs) {
    this._drainHandler = fn
    if (timeoutMs) {
      this._drainTimeout = setTimeout(() => {
        this.drain()
      }, timeoutMs).unref()
    }
  }

  // Call the drain handler, if there is one.
  //
  // This is a public method to allow a forced premature call of the drain
  // handler.
  drain () {
    if (this._drainHandler) {
      if (this._drainTimeout) {
        clearTimeout(this._drainTimeout)
        this._drainTimeout = null
      }
      this._drainHandler()
      // Remove the handler so it is only called once.
      this._drainHandler = null
    }
  }

  delete (key) {
    super.delete(key)
    if (this.size === 0) {
      this.drain()
    }
  }
}

module.exports = {
  InflightEventSet
}

// XXX move this to a test case
if (require.main === module) {
  const t = new InflightEventSet()
  t.setDrainHandler(() => {
    console.log('drained t!')
  })

  const s = new InflightEventSet(['d', 'e', 'f'])
  s.setDrainHandler(() => {
    console.log('drained s!')
  }, 1000)

  console.log('%d entries: %s', s.size, [...s])
  s.delete('d')
  console.log('%d entries: %s', s.size, [...s])
  s.delete('c')
  console.log('%d entries: %s', s.size, [...s])
  setTimeout(() => {
    s.delete('e')
    console.log('%d entries: %s', s.size, [...s])
    s.delete('f')
    console.log('%d entries: %s', s.size, [...s])
    s.add('a')
    console.log('%d entries: %s', s.size, [...s])
    s.delete('a')
    console.log('%d entries: %s', s.size, [...s])
  }, 2000)
}
