'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.

const { getDBDestination } = require('../../context')

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

  function generateSpan (params) {
    const span = agent.startSpan(null, 'db', 'elasticsearch', 'request')
    if (span === null) {
      return null
    }

    span.name = `Elasticsearch: ${params.method} ${params.path}`
    return span
  }

  class ApmClient extends elasticsearch.Client {
    constructor (opts) {
      super(opts)

      // Mapping an ES client event `result` to its active span.
      // - Use WeakMap to avoid a leak from possible spans that don't end.
      // - WeakMap allows us to key off the ES client `request` object itself,
      //   which means we don't need to rely on `request.id`, which might be
      //   unreliable because it is user-settable (see `generateRequestId` at
      //   https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
      // XXX change this to use the `result`
      const spanFromEsResult = new WeakMap()

      this.on('request', (err, result) => {
        const request = result.meta.request
        let span = spanFromEsResult.get(result)

        // As of @elastic/elasticsearch@7.10.0-rc.1 this event's `err` will
        // always be null, but we'll be future-proof.
        if (err) {
          agent.captureError(err)
          if (span !== undefined) {
            span.end()
            spanFromEsResult.delete(result)
          }
          return
        }

        // With retries (see `makeRequest` in Transport.js) each attempt will
        // emit this "request" event using the same `result` object. The
        // intent is to have one "elasticsearch" span an HTTP span for each
        // attempt.
        if (!span) {
          span = generateSpan(request.params)
          spanFromEsResult.set(result, span)
        }
        if (!span) {
          return
        }

        setDbContext(span, request.params)
        const {hostname, port} = result.meta.connection.url
        span.setDestinationContext(
          getDBDestination(span, hostname, port))
      })

      // XXX Test custom abort handling. Does that result in a 'response' with
      // err, such that we end the span?

      this.on('response', (err, result) => {
        // TODO set "span.outcome" (from err and result.statusCode)

        if (err) {
          // TODO: rebuild error object to avoid serialization issues?
          agent.captureError(err)
        }

        const span = spanFromEsResult.get(result)
        if (span !== undefined) {
          span.end()
          spanFromEsResult.delete(result)
        }
      })
    }
  }

  agent.logger.debug('subclassing @elastic/elasticsearch.Client')
  return Object.assign(elasticsearch, { Client: ApmClient })
}
