'use strict'

const semver = require('semver')
const sqlSummary = require('sql-summary')

const shimmer = require('../shimmer')

module.exports = function (cassandra, agent, { version, enabled }) {
  if (!enabled) return cassandra
  if (!semver.satisfies(version, '>=3 <5')) {
    agent.logger.debug('cassandra-driver version %s not supported - aborting...', version)
    return cassandra
  }

  if (cassandra.Client) {
    if (semver.gte(version, '4.4.0')) {
      // Prior to v4.4.0, the regular `connect` function would be called by the
      // other functions (e.g. `execute`). In newer versions an internal
      // `_connect` function is called instead (this is also called by
      // `connect`).
      shimmer.wrap(cassandra.Client.prototype, '_connect', wrapAsyncConnect)
    } else {
      shimmer.wrap(cassandra.Client.prototype, 'connect', wrapConnect)
    }
    shimmer.wrap(cassandra.Client.prototype, 'execute', wrapExecute)
    shimmer.wrap(cassandra.Client.prototype, 'eachRow', wrapEachRow)
    shimmer.wrap(cassandra.Client.prototype, 'batch', wrapBatch)
  }

  return cassandra

  function wrapAsyncConnect (original) {
    return async function wrappedAsyncConnect () {
      const span = agent.startSpan('Cassandra: Connect', 'db', 'cassandra', 'connect')
      try {
        return await original.apply(this, arguments)
      } finally {
        if (span) span.end()
      }
    }
  }

  function wrapConnect (original) {
    return function wrappedConnect (callback) {
      const span = agent.startSpan('Cassandra: Connect', 'db', 'cassandra', 'connect')
      if (!span) {
        return original.apply(this, arguments)
      }

      function resolve () {
        span.end()
      }

      // Wrap the callback
      const ret = original.call(this, wrapCallback(callback))

      if (typeof callback !== 'function') {
        if (typeof ret.then === 'function') {
          ret.then(resolve, resolve)
        } else {
          agent.logger.error('unable to identify span exit point for cassandra-driver')
        }
      }

      return ret

      function wrapCallback (cb) {
        if (typeof cb !== 'function') return cb
        return function wrappedCallback () {
          resolve()
          return cb.apply(this, arguments)
        }
      }
    }
  }

  function toQueryString (query) {
    return query.query
  }

  function wrapBatch (original) {
    return function wrappedBatch (queries, options, callback) {
      const span = agent.startSpan('Cassandra: Batch query', 'db', 'cassandra', 'query')
      if (!span) {
        return original.apply(this, arguments)
      }

      const queryStrings = queries.map(toQueryString)
      const query = queryStrings.join(';\n')

      span.setDbContext({
        statement: query,
        type: 'cassandra'
      })

      function resolve () {
        span.end()
      }

      // Wrap the callback
      const index = arguments.length - 1
      const cb = arguments[index]
      const isPromise = typeof cb !== 'function'
      if (!isPromise) {
        arguments[index] = function wrappedCallback () {
          resolve()
          return cb.apply(this, arguments)
        }
      }

      const ret = original.apply(this, arguments)

      if (isPromise) {
        if (typeof ret.then === 'function') {
          ret.then(resolve, resolve)
        } else {
          agent.logger.error('unable to identify span exit point for cassandra-driver')
        }
      }

      return ret
    }
  }

  function wrapExecute (original) {
    return function wrappedExecute (query, params, options, callback) {
      const span = agent.startSpan(null, 'db', 'cassandra', 'query')
      if (!span) {
        return original.apply(this, arguments)
      }

      span.setDbContext({ statement: query, type: 'cassandra' })
      span.name = sqlSummary(query)

      function resolve () {
        span.end()
      }

      // Wrap the callback
      const index = arguments.length - 1
      const cb = arguments[index]
      const isPromise = typeof cb !== 'function'
      if (!isPromise) {
        arguments[index] = function wrappedCallback () {
          resolve()
          return cb.apply(this, arguments)
        }
      }

      const ret = original.apply(this, arguments)

      if (isPromise) {
        if (typeof ret.then === 'function') {
          ret.then(resolve, resolve)
        } else {
          agent.logger.error('unable to identify span exit point for cassandra-driver')
        }
      }

      return ret
    }
  }

  function wrapEachRow (original) {
    return function wrappedEachRow (query, params, options, rowCallback, callback) {
      const span = agent.startSpan(null, 'db', 'cassandra', 'query')
      if (!span) {
        return original.apply(this, arguments)
      }

      span.setDbContext({ statement: query, type: 'cassandra' })
      span.name = sqlSummary(query)

      // Wrap the callback
      const index = arguments.length - 1
      const hasRowCallback = typeof arguments[index - 1] === 'function'

      function resolve () {
        span.end()
      }

      if (hasRowCallback) {
        const cb = arguments[index]
        if (typeof cb === 'function') {
          arguments[index] = function wrappedCallback () {
            resolve()
            return cb.apply(this, arguments)
          }
        } else {
          agent.logger.error('unable to identify span exit point for cassandra-driver')
        }
      } else {
        arguments[index + 1] = resolve
        arguments.length++
      }

      return original.apply(this, arguments)
    }
  }
}
