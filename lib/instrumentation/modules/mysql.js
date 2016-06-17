'use strict'

var shimmer = require('shimmer')
var semver = require('semver')
var sqlSummary = require('sql-summary')
var debug = require('debug')('opbeat')

module.exports = function (mysql, opbeat, version) {
  if (!semver.satisfies(version, '^2.0.0')) {
    debug('mysql version %s not suppoted - aborting...', version)
    return mysql
  }

  debug('shimming mysql.createConnection')
  shimmer.wrap(mysql, 'createConnection', wrapCreateConnection)

  return mysql

  function wrapCreateConnection (original) {
    return function wrappedCreateConnection () {
      var connection = original.apply(this, arguments)
      wrapObj(connection, 'connection', opbeat)
      return connection
    }
  }
}

function wrapObj (obj, objType, opbeat) {
  debug('shimming mysql %s.query', objType)
  shimmer.wrap(obj, 'query', wrapQuery)

  function wrapQuery (original) {
    return function wrappedQuery (sql, values, cb) {
      var trace = opbeat.buildTrace()
      var uuid = trace && trace.transaction._uuid
      var sqlStr

      debug('intercepted call to mysql %s.query %o', objType, { uuid: uuid })

      if (trace) {
        trace.type = 'db.mysql.query'

        switch (typeof sql) {
          case 'string':
            sqlStr = sql
            break
          case 'object':
            if (typeof sql._callback === 'function') {
              sql._callback = wrapCallback(sql._callback)
            }
            sqlStr = sql.sql
            break
          case 'function':
            arguments[0] = wrapCallback(sql)
            break
        }

        if (sqlStr) {
          debug('extracted sql from mysql query', { uuid: uuid, sql: sqlStr })
          trace.extra.sql = sqlStr
          trace.signature = sqlSummary(sqlStr)
        }

        if (typeof values === 'function') {
          arguments[1] = wrapCallback(values)
        } else if (typeof cb === 'function') {
          arguments[2] = wrapCallback(cb)
        }
      }

      var result = original.apply(this, arguments)

      if (trace && result) {
        shimmer.wrap(result, 'emit', function (original) {
          return function (event) {
            if (!trace.started) trace.start()
            switch (event) {
              case 'error':
              case 'end':
                trace.end()
            }
            return original.apply(this, arguments)
          }
        })
      }

      return result

      function wrapCallback (cb) {
        trace.start()
        return function wrappedCallback () {
          trace.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
