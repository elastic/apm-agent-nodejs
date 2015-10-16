'use strict'

var shimmer = require('shimmer')
var sqlSummary = require('sql-summary')

module.exports = function (pg, opbeat) {
  patchClient(pg.Client, 'pg.Client', opbeat)
  try {
    patchClient(pg.native.Client, 'pg.native.Client', opbeat)
  } catch (e) {}
  return pg
}

function patchClient (Client, klass, opbeat) {
  opbeat.logger.trace('shimming %s.prototype.query', klass)
  shimmer.wrap(Client.prototype, 'query', wrapQuery)

  function wrapQuery (orig, name) {
    return function wrappedFunction (sql) {
      var trans = opbeat.trans()
      var uuid = trans ? trans._uuid : 'n/a'

      opbeat.logger.trace('[%s] intercepted call to %s.prototype.%s (transaction: %sactive, sql: %s)', uuid, klass, name, trans ? '' : 'in', sql)

      if (trans) {
        var args = arguments
        var index = args.length - 1
        var cb = args[index]

        if (Array.isArray(cb)) {
          args = arguments
          index = cb.length - 1
          cb = cb[index]
        }

        var trace = trans.startTrace(sqlSummary(sql), 'db.postgresql.query')

        if (typeof cb === 'function') {
          args[index] = end
          return orig.apply(this, arguments)
        } else {
          cb = null
          var query = orig.apply(this, arguments)
          query.on('end', end)
          query.on('error', end)
          return query
        }
      } else {
        return orig.apply(this, arguments)
      }

      function end () {
        opbeat.logger.trace('[%s] intercepted end of %s.prototype.%s', uuid, klass, name)
        trace.end()
        if (cb) return cb.apply(null, arguments)
      }
    }
  }
}
