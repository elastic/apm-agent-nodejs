'use strict'

/**
 * TODO: Support batch queries
 */

const semver = require('semver')
const sqlSummary = require('sql-summary')

const shimmer = require('../shimmer')

module.exports = function (cassandra, agent, version, enabled) {
  if (!enabled) return cassandra
  if (!semver.satisfies(version, '^3.0.0')) {
    agent.logger.debug('cassandra version %s not supported - aborting...', version)
    return cassandra
  }

  if (cassandra.Client) {
    agent.logger.debug('shimming cassandra.Client.prototype._innerExecute')
    shimmer.wrap(cassandra.Client.prototype, '_innerExecute', wrapInnerExecute)
    shimmer.wrap(cassandra.Client.prototype, '_batchCb', wrapBatch)
  }

  return cassandra

  function wrapBatch (original) {
    return function wrappedBatch (queries, options, callback) {
      const spans = []

      for (let query of queries) {
        const span = agent.buildSpan()
        if (span) {
          span.type = 'db.cassandra.query'
          span.setDbContext({ statement: query.query, type: 'cassandra' })
          span.name = sqlSummary(query.query)
          spans.push(span)
          span.start()
        }
      }

      // Wrap the callback
      const index = arguments.length - 1
      const cb = arguments[index]
      arguments[index] = function wrappedCallback () {
        for (let span of spans) {
          span.end()
        }

        return cb.apply(this, arguments)
      }

      return original.apply(this, arguments)
    }
  }

  function wrapInnerExecute (original) {
    return function wrappedInnerExecute (query, params, options, callback) {
      const span = agent.buildSpan()

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
