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
  // XXX Instrumentation change: We don't need the wrapping of _pulseQueryQueue
  //     to ensure the user callbacks/event-handlers/promise-chains get run in
  //     the correct context.
  //     I'm not sure it ever helped: pg.test.js passes without it!
  // shimmer.wrap(Client.prototype, '_pulseQueryQueue', wrapPulseQueryQueue)
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

        // XXX Is this some pg pre-v8 thing that allowed an array of callbacks?
        //     This dates back to the orig pg support commit 6y ago.
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
          // XXX setOutcome should be called based on _err.
          agent.logger.debug('intercepted end of %s.prototype.%s %o', klass, name, { id: id })
          span.end()
        }

        // XXX From read of pg's v8 "client.js" it would be cleaner, I think,
        //     to look at the retval of `orig.apply(...)` rather than pulling
        //     out whether a callback cb was passed in the arguments. I.e.
        //     follow the https://node-postgres.com/api/client doc guarantees.
        //     However, I still don't have the node-postgres flow with queryQueue,
        //     pulseQueryQueue, and activeQuery down.
        if (typeof cb === 'function') {
          args[index] = agent._instrumentation.bindFunction((err, res) => {
            onQueryEnd(err)
            return cb(err, res)
          })
          return orig.apply(this, arguments)
        } else {
          var queryOrPromise = orig.apply(this, arguments)

          // XXX Clean up this comment.
          // The order of these if-statements matter!
          //
          // `query.then` is broken in pg <7 >=6.3.0, and since 6.x supports
          // `query.on`, we'll try that first to ensure we don't fall through
          // and use `query.then` by accident.
          //
          // XXX the following is misleading. You get result.on in v8 when passing a "Submittable".
          //     See https://node-postgres.com/guides/upgrading#upgrading-to-80
          // In 7+, we must use `query.then`, and since `query.on` have been
          // removed in 7.0.0, then it should work out.
          //
          // See this comment for details:
          // https://github.com/brianc/node-postgres/commit/b5b49eb895727e01290e90d08292c0d61ab86322#commitcomment-23267714
          if (typeof queryOrPromise.on === 'function') {
            // XXX This doesn't bind the possible 'row' handler, which is arguably a bug.
            //     One way to handle that would be to bindEventEmitter on `query` here
            //     if it *is* one (which it is if pg.Query was used). Likely won't affect
            //     typical usage, but not positive. This pg.Query usage is documented as
            //     rare/advanced/for lib authors. We should test with pg-cursor and
            //     pg-query-stream -- the two streaming libs that use this that
            //     are mentioned in the node-postgres docs.
            queryOrPromise.on('end', onQueryEnd)
            // XXX Setting 'error' event handler can change user code behaviour
            //     if they have no 'error' event handler. Instead wrap .emit(),
            //     assuming it has one.
            queryOrPromise.on('error', onQueryEnd)
            if (queryOrPromise instanceof EventEmitter) {
              agent._instrumentation.bindEmitter(queryOrPromise)
            }
          } else if (typeof queryOrPromise.then === 'function') {
            // XXX Behaviour change: No need to pass back our modified promise
            //     because context tracking automatically ensures the `queryOrPromise`
            //     chain of handlers will run with the appropriate context.
            //     Also no need to `throw err` in our reject/catch because we
            //     aren't returning this promise now.
            // XXX Does pg.test.js have any tests for errors from PG .query()?
            //     E.g. use `select 1 + as solution` syntax error.
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
