'use strict'

var shimmer = require('../shimmer')
var { getDBDestination } = require('../context')
const { setElasticsearchDbContext } = require('../elasticsearch-shared')

module.exports = function (elasticsearch, agent, { enabled }) {
  if (!enabled) return elasticsearch

  agent.logger.debug('shimming elasticsearch.Transport.prototype.request')
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'request', wrapRequest)

  return elasticsearch

  function wrapRequest (original) {
    return function wrappedRequest (params, cb) {
      var span = agent.startSpan(null, 'db', 'elasticsearch', 'request')
      var id = span && span.transaction.id
      var method = params && params.method
      var path = params && params.path

      agent.logger.debug('intercepted call to elasticsearch.Transport.prototype.request %o', { id: id, method: method, path: path })

      if (span && method && path) {
        span.name = `Elasticsearch: ${method} ${path}`

        setElasticsearchDbContext(span, path, params && params.query,
          params && params.body)

        // Get the remote host information from elasticsearch Transport options.
        const transportConfig = this._config
        let host, port
        if (typeof transportConfig === 'object' && transportConfig.host) {
          [host, port] = transportConfig.host.split(':')
        }
        span.setDestinationContext(getDBDestination(span, host, port))

        if (typeof cb === 'function') {
          var args = Array.prototype.slice.call(arguments)
          args[1] = function () {
            span.end()
            return cb.apply(this, arguments)
          }
          return original.apply(this, args)
        } else {
          const originalPromise = original.apply(this, arguments)

          const descriptors = Object.getOwnPropertyDescriptors(originalPromise)
          delete descriptors.domain

          const inspectedPromise = originalPromise
            .then(function (value) {
              span.end()
              return value
            }, function (err) {
              span.end()
              throw err
            })

          Object.defineProperties(inspectedPromise, descriptors)

          // we have to properly end the span when user aborts the request
          shimmer.wrap(inspectedPromise, 'abort', function wrapAbort (originalAbort) {
            return function wrappedAbort () {
              if (span.ended) return
              agent.logger.debug('intercepted call to elasticsearch.Transport.request.abort %o', { id: id, method: method, path: path })
              const originalReturn = originalAbort.apply(this, args)
              span.end()
              return originalReturn
            }
          })

          return inspectedPromise
        }
      } else {
        agent.logger.debug('could not instrument elasticsearch request %o', { id: id })
        return original.apply(this, arguments)
      }
    }
  }
}
