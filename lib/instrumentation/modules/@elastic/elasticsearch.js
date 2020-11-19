'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.

// TODO: ask Tomas about apiName addition to RequestEvent
const pathIsAQuery = /\/_((search|msearch)(\/template)?|count)$/

function setDbContext (span, params) {
  if (pathIsAQuery.test(params.path)) {
    // Some ES endpoints, e.g. '_search', support both query params and a body.
    // We encode both into 'span.context.db.statement', separated by '\n\n'
    // if both are present. E.g. for a possible msearch:
    //    search_type=query_then_fetch&typed_keys=false
    //
    //    {}
    //    {"query":{"query_string":{"query":"pants"}}}
    //
    // Note: A read of Transport.js suggests these will always be serialized
    // strings, however the documented `TransportRequestParams` allows for
    // non-strings, so we will be defensive.
    const parts = []
    if (params.querystring && typeof (params.querystring) === 'string') {
      parts.push(params.querystring)
    }
    if (params.body && typeof (params.body) === 'string') {
      parts.push(params.body)
    }
    const statement = parts.join('\n\n')

    if (statement) {
      span.setDbContext({
        type: 'elasticsearch',
        statement
      })
    }
  }
}

module.exports = function (elasticsearch, agent, { version, enabled }) {
  if (!enabled) return elasticsearch

  function generateSpan (spanFromEsReq, meta, params) {
    const span = agent.startSpan(null, 'db', 'elasticsearch', 'request')
    if (span === null) {
      return null
    }

    span.name = `Elasticsearch: ${params.method} ${params.path}`
    spanFromEsReq.set(meta.request, span)
    return span
  }

  class ApmClient extends elasticsearch.Client {
    constructor (opts) {
      super(opts)

      // Mapping an ES client request to its active span.
      // - Use WeakMap to avoid a leak from possible spans that don't end.
      // - WeakMap allows us to key off the ES client `request` object itself,
      //   which means we don't need to rely on `request.id`, which might be
      //   unreliable because it is user-settable (see `generateRequestId` at
      //   https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
      const spanFromEsReq = new WeakMap()

      this.on('request', (err, { meta }) => {
        // XXX see https://github.com/elastic/apm-agent-nodejs/pull/1266/files#r312033194
        // discussion on avoiding double serializing.

        const { request } = meta

        // As of @elastic/elasticsearch@7.10.0-rc.1 this event's `err` will
        // always be null, but we'll be future-proof.
        if (err) {
          const span = spanFromEsReq.get(request)
          agent.captureError(err)
          if (span !== undefined) {
            span.end()
            spanFromEsReq.delete(request)
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
        const oldSpan = spanFromEsReq.get(request)
        if (oldSpan) {
          console.log('XXX oldSpan, want to span.end() and clean up?', oldSpan)
          throw new Error('XXX')
        }

        const span = generateSpan(spanFromEsReq, meta, request.params)
        if (!span) {
          return
        }

        setDbContext(span, request.params)

        // XXX old elasticsearch module also does `span.setDestinationContext`.
      })

      // XXX Test custom abort handling. Does that result in a 'response' with
      // err, such that we end the span?

      this.on('response', (err, { meta }) => {
        // XXX set the "outcome" var

        if (err) {
          // XXX Wassup with all these options?
          // TODO: rebuild error object to avoid serialization issues
          agent.captureError(err, { custom: err.message })
          // agent.captureError(err, { labels: { meta: JSON.stringify(err.meta) } })
          // agent.captureError(err, { custom: JSON.parse(JSON.stringify(err.meta)) })
          // agent.captureError(err, { custom: err.meta.meta.connection })
        }

        const span = spanFromEsReq.get(meta.request)
        if (span !== undefined) {
          span.end()
          spanFromEsReq.delete(meta.request)
        }
      })
    }
  }

  agent.logger.debug('subclassing @elastic/elasticsearch.Client')
  return Object.assign(elasticsearch, { Client: ApmClient })
}
