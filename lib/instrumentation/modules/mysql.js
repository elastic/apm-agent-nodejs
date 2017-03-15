'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (mysql, opbeat, version) {
  if (!semver.satisfies(version, '^2.0.0')) {
    debug('mysql version %s not suppoted - aborting...', version)
    return mysql
  }

  debug('shimming mysql.createConnection')
  shimmer.wrap(mysql, 'createConnection', wrapCreateConnection)

  debug('shimming mysql.createPool')
  shimmer.wrap(mysql, 'createPool', wrapCreatePool)

  debug('shimming mysql.createPoolCluster')
  shimmer.wrap(mysql, 'createPoolCluster', wrapCreatePoolCluster)

  return mysql

  function wrapCreateConnection (original) {
    return function wrappedCreateConnection () {
      var connection = original.apply(this, arguments)

      wrapQueryable(connection, 'connection', opbeat)

      return connection
    }
  }

  function wrapCreatePool (original) {
    return function wrappedCreatePool () {
      var pool = original.apply(this, arguments)

      debug('shimming mysql pool.getConnection')
      shimmer.wrap(pool, 'getConnection', wrapGetConnection)

      return pool
    }
  }

  function wrapCreatePoolCluster (original) {
    return function wrappedCreatePoolCluster () {
      var cluster = original.apply(this, arguments)

      debug('shimming mysql cluster.of')
      shimmer.wrap(cluster, 'of', function wrapOf (original) {
        return function wrappedOf () {
          var ofCluster = original.apply(this, arguments)

          debug('shimming mysql cluster of.getConnection')
          shimmer.wrap(ofCluster, 'getConnection', wrapGetConnection)

          return ofCluster
        }
      })

      return cluster
    }
  }

  function wrapGetConnection (original) {
    return function wrappedGetConnection () {
      var cb = arguments[0]

      if (typeof cb === 'function') {
        arguments[0] = opbeat._instrumentation.bindFunction(function wrapedCallback (err, connection) { // eslint-disable-line handle-callback-err
          if (connection) wrapQueryable(connection, 'getConnection() > connection', opbeat)
          return cb.apply(this, arguments)
        })
      }

      return original.apply(this, arguments)
    }
  }
}

function wrapQueryable (obj, objType, opbeat) {
  debug('shimming mysql %s.query', objType)
  shimmer.wrap(obj, 'query', wrapQuery)

  function wrapQuery (original) {
    return function wrappedQuery (sql, values, cb) {
      var trace = opbeat.buildTrace()
      var uuid = trace && trace.transaction._uuid
      var hasCallback = false
      var sqlStr

      debug('intercepted call to mysql %s.query %o', objType, { uuid: uuid })

      if (trace) {
        trace.type = 'db.mysql.query'

        if (this._opbeatStackObj) {
          trace.customStackTrace(this._opbeatStackObj)
          this._opbeatStackObj = null
        }

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
          debug('extracted sql from mysql query %o', { uuid: uuid, sql: sqlStr })
          trace.extra.sql = sqlStr
          trace.name = sqlSummary(sqlStr)
        }

        if (typeof values === 'function') {
          arguments[1] = wrapCallback(values)
        } else if (typeof cb === 'function') {
          arguments[2] = wrapCallback(cb)
        }
      }

      var result = original.apply(this, arguments)

      if (trace && result && !hasCallback) {
        shimmer.wrap(result, 'emit', function (original) {
          return function (event) {
            trace.start()
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
        hasCallback = true
        trace.start()
        return function wrappedCallback () {
          trace.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
