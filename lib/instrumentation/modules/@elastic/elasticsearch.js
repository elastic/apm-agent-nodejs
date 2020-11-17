'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.

// XXX move to shared module
function setDbContext () {
  // XXX
}

module.exports = function (elasticsearch, agent, { version, enabled }) {
  if (!enabled) return elasticsearch

  function generateSpan (activeSpans, meta, params) {
    const span = agent.startSpan(null, 'db', 'elasticsearch', 'request')
    if (span === null) {
      return null
    }

    span.name = `Elasticsearch: ${params.method} ${params.path}`
    activeSpans.set(meta.request.id, span)
    return span
  }

  // XXX Test that this subclassing works with client.child(...) usage, which
  // does `new Client` internally.

  // XXX Test this works with promises-style usage of this client, given it
  // uses thenables, IIRC.

  class ApmClient extends elasticsearch.Client {
    constructor (opts) {
      // XXX more futureproof to handle any number of `arguments`?
      super(opts)

      // XXX Stephen Q on #1266 about considering `mapcap` (a Map with
      // LRU) to not leak spans that don't end. If so, I wonder if we
      // could setup a test case to test that leak.
      const activeSpans = new Map()

      this.on('request', (err, { meta }) => {
        // XXX see https://github.com/elastic/apm-agent-nodejs/pull/1266/files#r312033194
        // discussion on avoiding double serializing.

        const { request } = meta

        // As of version 7.10.0-rc.1 this event's `err` will always be
        // null, but we'll be future-proof.
        if (err) {
          const span = activeSpans.get(request.id)
          agent.captureError(err)
          if (span !== undefined) {
            span.end()
            activeSpans.delete(request.id)
          }
          return
        }

        // Note: On a retry (inside elasticsearch.Transport) we will
        // get another 'request' event without having gotten a
        // 'response'.
        // XXX esclient Transport.js will emit a 'request' event for
        // retries of the same logical request.
        // 1. What type of span handling
        // do we want for that? One single esclient span with multiple
        // sub-http spans? Currently we'll do multiple esclient spans...
        // which might be misleading? What do other modules do for retries
        // if anything. Note that `meta.attempts` probably has the info we'd
        // want for this.
        // 2. How could we test this? Hack into the module guts to simulate failure.
        const oldSpan = activeSpans.get(request.id)
        if (oldSpan) {
          console.log('XXX oldSpan, want to span.end() and clean up?', oldSpan)
          throw new Error('XXX')
        }

        const span = generateSpan(activeSpans, meta, request.params)
        if (span) {
          setDbContext(span, request.params)

          // XXX old elasticsearch module also does `span.setDestinationContext`.
        }
      })

      // XXX Test custom abort handling. Does that result in a 'response' with
      // err, such that we end the span?

      this.on('response', (err, { meta }) => {
        // XXX set the "outcome" var as well?

        if (err) {
          // XXX Wassup with all these options?
          // TODO: rebuild error object to avoid serialization issues
          agent.captureError(err, { custom: err.message })
          // agent.captureError(err, { labels: { meta: JSON.stringify(err.meta) } })
          // agent.captureError(err, { custom: JSON.parse(JSON.stringify(err.meta)) })
          // agent.captureError(err, { custom: err.meta.meta.connection })
        }

        const reqId = meta.request.id
        const span = activeSpans.get(reqId)
        if (span !== undefined) {
          span.end()
          activeSpans.delete(reqId)
        }
      })
    }
  }

  agent.logger.debug('subclassing @elastic/elasticsearch.Client')
  return Object.assign(elasticsearch, { Client: ApmClient })
}
