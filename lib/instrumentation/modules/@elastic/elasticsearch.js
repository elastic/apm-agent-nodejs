'use strict'

// Instrument the @elastic/elasticsearch module.
//
// This uses to 'request' and 'response' events from the Client (documented at
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
// to hook into all ES server interactions.
//
// Limitations:
// - In @elastic/elasticsearch >=7.14 <8, the HTTP span for ES spans made before
//   the product-check is finished will have an incorrect parent.
//
//   An Elasticsearch (ES) request typically results in a single HTTP request to
//   the server. The APM agent creates an HTTP span that is a child of the ES
//   span. For some of the later 7.x versions of @elastic/elasticsearch there is
//   a product-check "GET /" that blocks the *first* request to the server. This
//   results in:
//      ES span
//      |- ES span (the product check)
//      |  `- HTTP span (GET /)
//      `- HTTP span (GET /...)
//   This is fine so far. However, if any ES requests are made before that
//   product-check completes, then their HTTP requests are effectively queued.
//   When they *do* run, the async context of each HTTP request is that of the
//   initial "HTTP span (GET /...)". Currently the APM agent is not patching
//   for this.

const semver = require('semver')

const { getDBDestination } = require('../../context')
const { setElasticsearchDbContext } = require('../../elasticsearch-shared')
const shimmer = require('../../shimmer')

module.exports = function (elasticsearch, agent, { version, enabled }) {
  if (!enabled) {
    return elasticsearch
  }
  if (!elasticsearch.Client) {
    agent.logger.debug('@elastic/elasticsearch@%s is not supported (no `elasticsearch.Client`) - aborting...', version)
    return elasticsearch
  }

  // Before v7.7.0 the Transport#request() implementation's Promises support
  // would re-call `this.request(...)` inside a Promise.
  const doubleCallsRequestIfNoCb = semver.lt(version, '7.7.0')
  const ins = agent._instrumentation

  agent.logger.debug('shimming elasticsearch.Transport.prototype.{request,getConnection}')
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'request', wrapRequest)
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'getConnection', wrapGetConnection)

  // Mapping an ES client Connection object to its active span.
  // - Use WeakMap to avoid a leak from possible spans that don't end.
  // - WeakMap allows us to key off the ES client `request` object itself,
  //   which means we don't need to rely on `request.id`, which might be
  //   unreliable because it is user-settable (see `generateRequestId` at
  //   https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/observability.html)
  const connFromSpan = new WeakMap()

  return elasticsearch

  // Transport#request() calls Transport#getConnection() when it is ready to
  // make the HTTP request. This returns the actual connection to be used for
  // the request. This is limited, however:
  // - `getConnection()` is not called if the request was aborted early.
  // - If all connections are marked dead, then this returns null.
  // - We are assuming this is called with the correct async context. See
  //   "Limitations" above.
  function wrapGetConnection (origGetConnection) {
    return function wrappedGetConnection (opts) {
      const conn = origGetConnection.apply(this, arguments)
      const currSpan = ins.currSpan()
      if (conn && currSpan) {
        connFromSpan[currSpan] = conn
      }
      return conn
    }
  }

  function wrapRequest (origRequest) {
    return function wrappedRequest (params, options, cb) {
      options = options || {}
      if (typeof options === 'function') {
        cb = options
        options = {}
      }

      if (typeof cb !== 'function' && doubleCallsRequestIfNoCb) {
        return origRequest.apply(this, arguments)
      }

      const method = (params && params.method) || '<UnknownMethod>'
      const path = (params && params.path) || '<UnknownPath>'
      agent.logger.debug({ method, path }, 'intercepted call to @elastic/elasticsearch.Transport.prototype.request')
      const span = ins.createSpan(`Elasticsearch: ${method} ${path}`, 'db', 'elasticsearch', 'request')
      if (!span) {
        return origRequest.apply(this, arguments)
      }

      const parentRunContext = ins.currRunContext()
      const spanRunContext = parentRunContext.enterSpan(span)
      const finish = ins.bindFunctionToRunContext(spanRunContext, (err, _result) => {
        // Set DB context.
        // In @elastic/elasticsearch@7, `Transport#request` encodes
        // `params.{querystring,body}` in-place; use it. In >=8 this encoding is
        // no longer in-place. A better eventual solution would be to wrap
        // `Connection.request` to capture the serialized params.
        setElasticsearchDbContext(
          span,
          params && params.path,
          params && params.querystring,
          params && (params.body || params.bulkBody))

        // Set destination context.
        // Use the connection from wrappedGetConnection() above, if that worked.
        // Otherwise, fallback to using the first connection on
        // `Transport#connectionPool`, if any.  (This is the best parsed
        // representation of connection options passed to the Client ctor.)
        let conn = connFromSpan[span]
        if (conn) {
          connFromSpan.delete(span)
        } else if (this.connectionPool && this.connectionPool.connections) {
          conn = this.connectionPool.connections[0]
        }
        const connUrl = conn && conn.url
        span.setDestinationContext(getDBDestination(span,
          connUrl && connUrl.hostname, connUrl && connUrl.port))

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
            captureAttributes: false
          }
          if (err.name === 'ResponseError' && err.body && err.body.error) {
            // Include some data from the Elasticsearch API response body:
            // https://www.elastic.co/guide/en/elasticsearch/reference/current/common-options.html#common-options-error-options
            errOpts.custom = {
              type: err.body.error.type,
              reason: err.body.error.reason,
              status: err.body.status
            }
            if (err.body.error.caused_by) {
              errOpts.custom.caused_by = err.body.error.caused_by
            }
          }
          agent.captureError(err, errOpts)
        }

        span.end()
      })

      if (typeof cb === 'function') {
        const wrappedCb = (err, result) => {
          finish(err, result)
          ins.withRunContext(parentRunContext, cb, this, err, result)
        }
        return ins.withRunContext(spanRunContext, origRequest, this, params, options, wrappedCb)
      } else {
        const origPromise = ins.withRunContext(spanRunContext, origRequest, this, ...arguments)
        origPromise.then(
          function onResolve (result) {
            finish(null, result)
          },
          function onReject (err) {
            finish(err, null)
          }
        )

        return origPromise
      }
    }
  }
}
