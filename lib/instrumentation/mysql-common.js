'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')
var debug = require('debug')('elastic-apm')
var shimmer = require('./shimmer')

module.exports = function (mysqlModuleName, semverRequirement) {
  return function (mysql, agent, version) {
    if (!semver.satisfies(version, semverRequirement)) {
      debug('mysql version %s not supported - aborting...', version)
      return mysql
    }

    debug('shimming %s.createConnection', mysqlModuleName)
    shimmer.wrap(mysql, 'createConnection', wrapCreateConnection)

    debug('shimming %s.createPool', mysqlModuleName)
    shimmer.wrap(mysql, 'createPool', wrapCreatePool)

    debug('shimming %s.createPoolCluster', mysqlModuleName)
    shimmer.wrap(mysql, 'createPoolCluster', wrapCreatePoolCluster)

    return mysql

    function wrapCreateConnection (original) {
      return function wrappedCreateConnection () {
        var connection = original.apply(this, arguments)

        wrapQueryable(connection, 'connection', agent)

        return connection
      }
    }

    function wrapCreatePool (original) {
      return function wrappedCreatePool () {
        var pool = original.apply(this, arguments)

        debug('shimming %s pool.getConnection', mysqlModuleName)
        shimmer.wrap(pool, 'getConnection', wrapGetConnection)

        return pool
      }
    }

    function wrapCreatePoolCluster (original) {
      return function wrappedCreatePoolCluster () {
        var cluster = original.apply(this, arguments)

        debug('shimming %s cluster.of', mysqlModuleName)
        shimmer.wrap(cluster, 'of', function wrapOf (original) {
          return function wrappedOf () {
            var ofCluster = original.apply(this, arguments)

            debug('shimming %s cluster of.getConnection', mysqlModuleName)
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
          arguments[0] = agent._instrumentation.bindFunction(function wrapedCallback (err, connection) { // eslint-disable-line handle-callback-err
            if (connection) wrapQueryable(connection, 'getConnection() > connection', agent)
            return cb.apply(this, arguments)
          })
        }

        return original.apply(this, arguments)
      }
    }
  }

  function wrapQueryable (obj, objType, agent) {
    debug('shimming %s %s.query', mysqlModuleName, objType)
    shimmer.wrap(obj, 'query', wrapQuery)

    function wrapQuery (original) {
      return function wrappedQuery (sql, values, cb) {
        var trace = agent.buildTrace()
        var id = trace && trace.transaction.id
        var hasCallback = false
        var sqlStr

        debug('intercepted call to %s %s.query %o', mysqlModuleName, objType, { id: id })

        if (trace) {
          trace.type = 'db.mysql.query'

          if (this._elastic_apm_stack_obj) {
            trace.customStackTrace(this._elastic_apm_stack_obj)
            this._elastic_apm_stack_obj = null
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
            debug('extracted sql from %s query %o', mysqlModuleName, { id: id, sql: sqlStr })
            trace.setDbContext({statement: sqlStr, type: 'sql'})
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
}
