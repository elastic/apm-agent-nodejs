'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

module.exports = function (memcached, agent, { version, enabled }) {
  if (!enabled) {
    return memcached
  }
  if (!semver.satisfies(version, '>=2.2.0')) {
    agent.logger.debug('Memcached version %s not supported - aborting...', version)
    return memcached
  }
  agent.logger.debug('shimming memcached.prototype.command')
  shimmer.wrap(memcached.prototype, 'command', wrapCommand)
  return memcached

  // Wrap the generic command that is used to build touch, get, gets etc
  function wrapCommand (original) {
    return function wrappedCommand () {
      if (typeof arguments[0] === 'function') {
        var query = arguments[0]()
        // If the callback is not a function the user doesn't care about result
        if (query && typeof query.callback === 'function') {
          var span = agent.startSpan(`memcached.${query.type}`, `db.memcached.${query.type}`)
          if (span) {
            span.setDbContext({ statement: `${query.type} ${query.key}`, type: 'memcached' })
            var id = span.id
          }
          agent.logger.debug('intercepted call to memcached.prototype.command %o', { id: id, type: query.type })
          query.callback = wrapCallback(query.callback)
          // Rewrite the query compiler with the wrapped callback
          arguments[0] = function queryCompiler () {
            return query
          }
        }
      }
      return original.apply(this, arguments)

      function wrapCallback (cb) {
        return function wrappedCallback () {
          if (span) span.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
