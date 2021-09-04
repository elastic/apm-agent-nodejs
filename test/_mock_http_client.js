'use strict'

// This is a mock "elastic-apm-http-client".
//
// Usage:
//
// 1. Create a client for an expected number of writes:
//
//      var mockClient = require('.../_mock_http_client')
//      agent._transport = mockClient(expected, done)
//
//    The `done` callback will be called with the written data (`_writes`)
//    once the `expected` number of writes have occurred.
//
// 2. Create a client that calls back after a delay without writes:
//
//      var mockClient = require('.../_mock_http_client')
//      agent._transport = mockClient(done)
//
//    The `done` callback will be called with the written data (`_writes`)
//    after a 200ms delay with no writes (the timer only starts after the
//    first write).

function noop () {}

function createMockClient (expected, done) {
  const timerBased = typeof expected === 'function'
  if (timerBased) done = expected
  let timer

  const client = {
    _writes: { length: 0, spans: [], transactions: [], errors: [], metricsets: [] },
    _write (obj, cb) {
      cb = cb || noop

      const type = Object.keys(obj)[0]
      this._writes.length++
      this._writes[type + 's'].push(obj[type])
      // console.warn('XXX mock client "%s" write: %s', type, obj)

      process.nextTick(cb)

      if (timerBased) resetTimer()
      else if (this._writes.length === expected) {
        // Give a short delay for subsequent events (typically a span delayed
        // by asynchronous `span._encode()`) to come in so a test doesn't
        // unwittingly pass, when in fact more events than expected are
        // produced.
        // XXX Play with this delay? This might significantly increase test time. Not sure.
        //    E.g. 'node test/integration/index.test.js' from 0.5s to 3.5s :/
        //    Better solutions: (a) explicit delay when playing with spans
        //    (b) issue #2294 to have `agent.flush()` actually flush inflight spans.
        // XXX I've since disabled this because it breaks timing assumptions in
        //     code using this mock client. While those assumptions are a pain,
        //     I don't want to re-write *all* that test code now.
        // const SHORT_DELAY = 100
        // setTimeout(() => {
        done(this._writes)
        // }, SHORT_DELAY)
      } else if (this._writes.length > expected) {
        let summary = JSON.stringify(obj)
        if (summary.length > 200) {
          summary = summary.slice(0, 197) + '...'
        }
        throw new Error(`too many writes: unexpected write: ${summary}`)
      }
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
    sendMetricSet (metricset, cb) {
      this._write({ metricset }, cb)
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
    }, 200)
  }
}

module.exports = createMockClient
