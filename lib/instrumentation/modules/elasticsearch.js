'use strict'

var { setDbContext } = require('../elasticsearch-shared')
var shimmer = require('../shimmer')

module.exports = function (elasticsearch, agent, { enabled }) {
  if (!enabled) return elasticsearch

  agent.logger.debug('shimming elasticsearch.Transport.prototype.request')
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'request', wrapRequest)

  return elasticsearch

  function wrapRequest (original) {
    return function wrappedRequest (params, cb) {
      var span = agent.startSpan(null, 'db.elasticsearch.request')
      var id = span && span.transaction.id
      var method = params && params.method
      var path = params && params.path

      agent.logger.debug('intercepted call to elasticsearch.Transport.prototype.request %o', { id: id, method: method, path: path })

      if (span && method && path) {
        span.name = `Elasticsearch: ${method} ${path}`

        setDbContext(span, params)

        if (typeof cb === 'function') {
          var args = Array.prototype.slice.call(arguments)
          args[1] = function () {
            span.end()
            return cb.apply(this, arguments)
          }
          return original.apply(this, args)
        } else {
          return original.apply(this, arguments)
            .then(function (originalP) {
              span.end()
              return originalP
            }, function (err) {
              span.end()
              throw err
            })
        }
      } else {
        agent.logger.debug('could not instrument elasticsearch request %o', { id: id })
        return original.apply(this, arguments)
      }
    }
  }
}
