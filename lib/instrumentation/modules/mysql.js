'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')
var { getDBDestination } = require('../context')

module.exports = function (mysql, agent, { version, enabled }) {
  if (!semver.satisfies(version, '^2.0.0')) {
    agent.logger.debug('mysql version %s not supported - aborting...', version)
    return mysql
  }

  agent.logger.debug('shimming mysql.createPool')
  shimmer.wrap(mysql, 'createPool', wrapCreatePool)

  agent.logger.debug('shimming mysql.createPoolCluster')
  shimmer.wrap(mysql, 'createPoolCluster', wrapCreatePoolCluster)

  if (!enabled) return mysql

  agent.logger.debug('shimming mysql.createConnection')
  shimmer.wrap(mysql, 'createConnection', wrapCreateConnection)

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

      agent.logger.debug('shimming mysql pool.getConnection')
      shimmer.wrap(pool, 'getConnection', wrapGetConnection)

      return pool
    }
  }

  function wrapCreatePoolCluster (original) {
    return function wrappedCreatePoolCluster () {
      var cluster = original.apply(this, arguments)

      agent.logger.debug('shimming mysql cluster.of')
      shimmer.wrap(cluster, 'of', function wrapOf (original) {
        return function wrappedOf () {
          var ofCluster = original.apply(this, arguments)

          agent.logger.debug('shimming mysql cluster of.getConnection')
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
          if (connection && enabled) wrapQueryable(connection, 'getConnection() > connection', agent)
          return cb.apply(this, arguments)
        })
      }

      return original.apply(this, arguments)
    }
  }
}

function wrapQueryable (connection, objType, agent) {
  agent.logger.debug('shimming mysql %s.query', objType)
  shimmer.wrap(connection, 'query', wrapQuery)

  let host, port
  if (typeof connection.config === 'object') {
    ({ host, port } = connection.config)
  }

  function wrapQuery (original) {
    return function wrappedQuery (sql, values, cb) {
      var span = agent.startSpan(null, 'db', 'mysql', 'query')
      var id = span && span.transaction.id
      var hasCallback = false
      var sqlStr

      agent.logger.debug('intercepted call to mysql %s.query %o', objType, { id: id })

      if (span) {
        if (this[symbols.knexStackObj]) {
          span.customStackTrace(this[symbols.knexStackObj])
          this[symbols.knexStackObj] = null
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
          agent.logger.debug('extracted sql from mysql query %o', { id: id, sql: sqlStr })
          span.setDbContext({ statement: sqlStr, type: 'sql' })
          span.name = sqlSummary(sqlStr)
        }
        span.setDestinationContext(getDBDestination(span, host, port))

        if (typeof values === 'function') {
          arguments[1] = wrapCallback(values)
        } else if (typeof cb === 'function') {
          arguments[2] = wrapCallback(cb)
        }
      }

      var result = original.apply(this, arguments)

      if (span && result && !hasCallback) {
        shimmer.wrap(result, 'emit', function (original) {
          return function (event) {
            switch (event) {
              case 'error':
              case 'end':
                span.end()
            }
            return original.apply(this, arguments)
          }
        })
      }

      return result

      function wrapCallback (cb) {
        hasCallback = true
        return function wrappedCallback () {
          span.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
