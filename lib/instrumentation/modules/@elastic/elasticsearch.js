'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.

const { getDBDestination } = require('../../context')

// URL paths matching the following pattern will have their query params and
// request body captured in the span (as `context.db.statement`). We match
// a complete URL path component to attempt to avoid accidental matches of
// user data, like `GET /my_index_search/...`.
const pathIsAQuery = /\/(_search|_msearch|_count|_async_search|_sql|_eql)(\/|$)/

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
  if (!enabled) {
    return elasticsearch
  }
  if (!elasticsearch.Client) {
    agent.logger.debug('@elastic/elasticsearch@%s is not supported (no `elasticsearch.Client`) - aborting...', version)
    return elasticsearch
  }

  function generateSpan (params) {
    const span = agent.startSpan(null, 'db', 'elasticsearch', 'request')
    if (span === null) {
      return null
    }

    span.name = `Elasticsearch: ${params.method} ${params.path}`
    return span
  }

  class ApmClient extends elasticsearch.Client {
    constructor (...args) {
      super(...args)

      // Mapping an ES client event `result` to its active span.
      // - Use WeakMap to avoid a leak from possible spans that don't end.
      // - WeakMap allows us to key off the ES client `request` object itself,
      //   which means we don't need to rely on `request.id`, which might be
      //   unreliable because it is user-settable (see `generateRequestId` at
      //   https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
      const spanFromEsResult = new WeakMap()

      this.on('request', (err, result) => {
        const request = result.meta.request
        agent.logger.debug('intercepted call to @elastic/elasticsearch "request" event %o',
          { id: request.id, method: request.params.method, path: request.params.path })

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
        // intent is to have one Elasticsearch span plus an HTTP span for each
        // attempt.
        if (!span) {
          span = generateSpan(request.params)
          if (span) {
            spanFromEsResult.set(result, span)
          }
        }
        if (!span) {
          return
        }

        setDbContext(span, request.params)
        const { hostname, port } = result.meta.connection.url
        span.setDestinationContext(
          getDBDestination(span, hostname, port))
      })

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
