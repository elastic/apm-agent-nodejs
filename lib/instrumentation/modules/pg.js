'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')
var { getDBDestination } = require('../context')

module.exports = function (pg, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>=4.0.0 <9.0.0')) {
    agent.logger.debug('pg version %s not supported - aborting...', version)
    return pg
  }

  patchClient(pg.Client, 'pg.Client', agent, enabled)

  // Trying to access the pg.native getter will trigger and log the warning
  // "Cannot find module 'pg-native'" to STDERR if the module isn't installed.
  // Overwriting the getter we can lazily patch the native client only if the
  // user is acually requesting it.
  var getter = pg.__lookupGetter__('native')
  if (getter) {
    delete pg.native
    // To be as true to the original pg module as possible, we use
    // __defineGetter__ instead of Object.defineProperty.
    pg.__defineGetter__('native', function () {
      var native = getter()
      if (native && native.Client) {
        patchClient(native.Client, 'pg.native.Client', agent, enabled)
      }
      return native
    })
  }

  return pg
}

function patchClient (Client, klass, agent, enabled) {
  agent.logger.debug('shimming %s.prototype.query', klass)
  shimmer.wrap(Client.prototype, '_pulseQueryQueue', wrapPulseQueryQueue)
  if (!enabled) return

  shimmer.wrap(Client.prototype, 'query', wrapQuery)

  function wrapQuery (orig, name) {
    return function wrappedFunction (sql) {
      var span = agent.startSpan('SQL', 'db', 'postgresql', 'query')
      var id = span && span.transaction.id

      if (sql && typeof sql.text === 'string') sql = sql.text

      agent.logger.debug('intercepted call to %s.prototype.%s %o', klass, name, { id: id, sql: sql })

      if (span) {
        // get connection parameters from Client
        let host, port
        if (typeof this.connectionParameters === 'object') {
          ({ host, port } = this.connectionParameters)
        }
        span.setDestinationContext(getDBDestination(span, host, port))

        var args = arguments
        var index = args.length - 1
        var cb = args[index]

        if (this[symbols.knexStackObj]) {
          span.customStackTrace(this[symbols.knexStackObj])
          this[symbols.knexStackObj] = null
        }

        if (Array.isArray(cb)) {
          index = cb.length - 1
          cb = cb[index]
        }

        if (typeof sql === 'string') {
          span.setDbContext({ statement: sql, type: 'sql' })
          span.name = sqlSummary(sql)
        } else {
          agent.logger.debug('unable to parse sql form pg module (type: %s)', typeof sql)
        }

        if (typeof cb === 'function') {
          args[index] = end
          return orig.apply(this, arguments)
        } else {
          cb = null
          var query = orig.apply(this, arguments)

          // The order of these if-statements matter!
          //
          // `query.then` is broken in pg <7 >=6.3.0, and since 6.x supports
          // `query.on`, we'll try that first to ensure we don't fall through
          // and use `query.then` by accident.
          //
          // In 7+, we must use `query.then`, and since `query.on` have been
          // removed in 7.0.0, then it should work out.
          //
          // See this comment for details:
          // https://github.com/brianc/node-postgres/commit/b5b49eb895727e01290e90d08292c0d61ab86322#commitcomment-23267714
          if (typeof query.on === 'function') {
            query.on('end', end)
            query.on('error', end)
          } else if (typeof query.then === 'function') {
            query = query
              .then(function (result) {
                end()
                return result
              })
              .catch(function (err) {
                end()
                throw err
              })
          } else {
            agent.logger.debug('ERROR: unknown pg query type: %s %o', typeof query, { id: id })
          }

          return query
        }
      } else {
        return orig.apply(this, arguments)
      }

      function end () {
        agent.logger.debug('intercepted end of %s.prototype.%s %o', klass, name, { id: id })
        span.end()
        if (cb) return cb.apply(this, arguments)
      }
    }
  }

  // The client maintains an internal callback queue for all the queries. In
  // 7.0.0, the queries are true promises (as opposed to faking the Promise API
  // in ^6.3.0). To properly get the right context when the Promise API is
  // used, we need to patch all callbacks in the callback queue.
  //
  // _pulseQueryQueue is usually called when something have been added to the
  // client.queryQueue array. This gives us a chance to bind to the newly
  // queued objects callback.
  function wrapPulseQueryQueue (orig) {
    return function wrappedFunction () {
      if (this.queryQueue) {
        var query = this.queryQueue[this.queryQueue.length - 1]
        if (query && typeof query.callback === 'function' && query.callback.name !== 'elasticAPMCallbackWrapper') {
          query.callback = agent._instrumentation.bindFunction(query.callback)
        }
      } else {
        agent.logger.debug('ERROR: Internal structure of pg Client object have changed!')
      }
      return orig.apply(this, arguments)
    }
  }
}
