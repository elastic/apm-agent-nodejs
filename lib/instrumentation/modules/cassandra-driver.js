'use strict'

/**
 * TODO: Support batch queries
 */

var semver = require('semver')
var sqlSummary = require('sql-summary')

var shimmer = require('../shimmer')

module.exports = function (cassandra, agent, version, enabled) {
  if (!enabled) return cassandra
  if (!semver.satisfies(version, '^3.0.0')) {
    agent.logger.debug('cassandra version %s not supported - aborting...', version)
    return cassandra
  }

  if (cassandra.Client) {
    agent.logger.debug('shimming cassandra.Client.prototype._innerExecute')
    shimmer.wrap(cassandra.Client.prototype, '_innerExecute', wrapInnerExecute)
  }

  return cassandra

  function wrapInnerExecute (original) {
    return function wrappedInnerExecute (query, params, options, callback) {
      var span = agent.buildSpan()

      if (span) {
        span.type = 'db.cassandra.query'
        span.setDbContext({ statement: query, type: 'cassandra' })
        span.name = sqlSummary(query)

        // Wrap the callback
        const last = arguments.length - 1
        arguments[last] = wrapCallback(arguments[last])
      }

      return original.apply(this, arguments)

      function wrapCallback (cb) {
        span.start()
        return function wrappedCallback () {
          span.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
