'use strict'

const EventEmitter = require('events')

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
  if (!enabled) return

  agent.logger.debug('shimming %s.prototype.query', klass)
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

        const onQueryEnd = (_err) => {
          agent.logger.debug('intercepted end of %s.prototype.%s %o', klass, name, { id: id })
          span.end()
        }

        if (typeof cb === 'function') {
          args[index] = agent._instrumentation.bindFunction((err, res) => {
            onQueryEnd(err)
            return cb(err, res)
          })
          return orig.apply(this, arguments)
        } else {
          var queryOrPromise = orig.apply(this, arguments)

          // It is import to prefer `.on` to `.then` for pg <7 >=6.3.0, because
          // `query.then` is broken in those versions. See
          // https://github.com/brianc/node-postgres/commit/b5b49eb895727e01290e90d08292c0d61ab86322#r23267714
          if (typeof queryOrPromise.on === 'function') {
            queryOrPromise.on('end', onQueryEnd)
            queryOrPromise.on('error', onQueryEnd)
            if (queryOrPromise instanceof EventEmitter) {
              agent._instrumentation.bindEmitter(queryOrPromise)
            }
          } else if (typeof queryOrPromise.then === 'function') {
            queryOrPromise.then(
              () => { onQueryEnd() },
              onQueryEnd
            )
          } else {
            agent.logger.debug('ERROR: unknown pg query type: %s %o', typeof queryOrPromise, { id: id })
          }

          return queryOrPromise
        }
      } else {
        return orig.apply(this, arguments)
      }
    }
  }
}
