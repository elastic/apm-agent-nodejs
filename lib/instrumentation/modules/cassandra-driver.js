'use strict'

const semver = require('semver')
const sqlSummary = require('sql-summary')

const shimmer = require('../shimmer')

module.exports = function (cassandra, agent, version, enabled) {
  if (!enabled) return cassandra
  if (!semver.satisfies(version, '^3.0.0')) {
    agent.logger.debug('cassandra-driver version %s not supported - aborting...', version)
    return cassandra
  }

  if (cassandra.Client) {
    shimmer.wrap(cassandra.Client.prototype, 'connect', wrapConnect)
    shimmer.wrap(cassandra.Client.prototype, 'execute', wrapExecute)
    shimmer.wrap(cassandra.Client.prototype, 'eachRow', wrapEachRow)
    shimmer.wrap(cassandra.Client.prototype, 'batch', wrapBatch)
  }

  return cassandra

  function wrapConnect (original) {
    return function wrappedConnect (callback) {
      const span = agent.buildSpan()
      if (!span) {
        return original.apply(this, arguments)
      }

      span.type = 'db.cassandra.connect'
      span.start()

      function resolve () {
        span.end()
      }

      // Wrap the callback
      const ret = original.call(this, wrapCallback(callback))

      if (typeof callback !== 'function') {
        ret.then(resolve, resolve)
      }

      return ret

      function wrapCallback (cb) {
        if (!cb) return
        return function wrappedCallback () {
          resolve()
          return cb.apply(this, arguments)
        }
      }
    }
  }

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

      function resolve () {
        for (let span of spans) {
          span.end()
        }
      }

      // Wrap the callback
      const index = arguments.length - 1
      const cb = arguments[index]
      const isPromise = typeof cb !== 'function'
      if (!isPromise && spans.length) {
        arguments[index] = function wrappedCallback () {
          resolve()
          return cb.apply(this, arguments)
        }
      }

      const ret = original.apply(this, arguments)

      if (isPromise && spans.length) {
        ret.then(resolve, resolve)
      }

      return ret
    }
  }

  function wrapExecute (original) {
    return function wrappedExecute (query, params, options, callback) {
      const span = agent.buildSpan()
      if (!span) {
        return original.apply(this, arguments)
      }

      span.type = 'db.cassandra.query'
      span.setDbContext({ statement: query, type: 'cassandra' })
      span.name = sqlSummary(query)
      span.start()

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
        ret.then(resolve, resolve)
      }

      return ret
    }
  }

  function wrapEachRow (original) {
    return function wrappedEachRow (query, params, options, rowCallback, callback) {
      const span = agent.buildSpan()
      if (!span) {
        return original.apply(this, arguments)
      }

      span.type = 'db.cassandra.query'
      span.setDbContext({ statement: query, type: 'cassandra' })
      span.name = sqlSummary(query)
      span.start()

      // Wrap the callback
      const index = arguments.length - 1
      const hasCallback = typeof arguments[index - 1] === 'function'
      const cb = hasCallback ? arguments[index] : () => {}
      arguments[index] = function wrappedCallback () {
        span.end()
        return cb.apply(this, arguments)
      }

      return original.apply(this, arguments)
    }
  }
}
