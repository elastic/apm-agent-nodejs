'use strict'

var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')

module.exports = function (elasticsearch, agent, version) {
  debug('shimming elasticsearch.Transport.prototype.request')
  shimmer.wrap(elasticsearch.Transport && elasticsearch.Transport.prototype, 'request', wrapRequest)

  return elasticsearch

  function wrapRequest (original) {
    return function wrappedRequest (params, cb) {
      var trace = agent.buildTrace()
      var id = trace && trace.transaction.id
      var method = params && params.method
      var path = params && params.path
      var query = params && params.query

      debug('intercepted call to elasticsearch.Transport.prototype.request %o', {id: id, method: method, path: path})

      if (trace && method && path) {
        trace.start('Elasticsearch: ' + method + ' ' + path, 'db.elasticsearch.request')

        if (query) trace.setDbContext({statement: JSON.stringify(query), type: 'elasticsearch'})

        if (typeof cb === 'function') {
          var args = Array.prototype.slice.call(arguments)
          args[1] = function () {
            trace.end()
            return cb.apply(this, arguments)
          }
          return original.apply(this, args)
        } else {
          var p = original.apply(this, arguments)
          p.then(function () {
            trace.end()
          })
          return p
        }
      } else {
        debug('could not trace elasticsearch request %o', {id: id})
        return original.apply(this, arguments)
      }
    }
  }
}
