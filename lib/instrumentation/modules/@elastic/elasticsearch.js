'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.

const { getDBDestination } = require('../../context')
const { setElasticsearchDbContext } = require('../../elasticsearch-shared')
const constants = require('../../../constants')

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

        setElasticsearchDbContext(span, request.params.path,
          request.params.querystring, request.params.body)

        const { hostname, port } = result.meta.connection.url
        span.setDestinationContext(
          getDBDestination(span, hostname, port))
      })

      this.on('response', (err, result) => {
        const span = spanFromEsResult.get(result)

        if (err) {
          // Error properties are specified here:
          // https://github.com/elastic/elasticsearch-js/blob/master/lib/errors.d.ts
          // - We capture some data from ResponseError, which is for
          //   Elasticsearch API errors:
          //   https://www.elastic.co/guide/en/elasticsearch/reference/current/common-options.html#common-options-error-options
          // - Otherwise we explicitly turn off `captureAttributes` to avoid
          //   grabbing potentially large and sensitive properties like
          //   `err.data` on DeserializationError.
          const errOpts = {
            captureAttributes: false,
            skipOutcome: true
          }
          if (err.name === 'ResponseError' && err.body && err.body.error) {
            // Include some data from the Elasticsearch API response body:
            // https://www.elastic.co/guide/en/elasticsearch/reference/current/common-options.html#common-options-error-options
            errOpts.custom = {
              type: err.body.error.type,
              reason: err.body.error.reason,
              caused_by: err.body.error.caused_by,
              status: err.body.status
            }
          }

          // The capture error method normally sets an outcome on the
          // active span.  However, the Elasticsearch client span (the span
          // we're concerned with here) is no longer the active span.
          // Therefore, we manully set an outcome here, and also set
          // errOpts.skipOutcome above. The errOpts.skipOutcome options
          // instructs captureError to _not_ set the outcome on the active span
          if (span !== undefined) {
            span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
          }
          agent.captureError(err, errOpts)
        }

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
