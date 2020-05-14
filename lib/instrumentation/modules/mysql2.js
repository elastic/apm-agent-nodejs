'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')
var { getDBDestination } = require('../context')

module.exports = function (mysql2, agent, { version, enabled }) {
  var ins = agent._instrumentation
  if (!semver.satisfies(version, '>=1 <3')) {
    agent.logger.debug('mysql2 version %s not supported - aborting...', version)
    return mysql2
  }

  shimmer.wrap(mysql2.Connection.prototype, 'query', wrapQuery)
  shimmer.wrap(mysql2.Connection.prototype, 'execute', wrapQuery)

  return mysql2

  function wrapQuery (original) {
    return function wrappedQuery (sql, values, cb) {
      var span = enabled && agent.startSpan(null, 'db', 'mysql', 'query')
      var id = span && span.transaction.id
      var hasCallback = false
      var sqlStr

      if (span) {
        if (this[symbols.knexStackObj]) {
          span.customStackTrace(this[symbols.knexStackObj])
          this[symbols.knexStackObj] = null
        }
        // get connection parameters from mysql config
        let host, port
        if (typeof this.config === 'object') {
          ({ host, port } = this.config)
        }
        span.setDestinationContext(getDBDestination(span, host, port))
      }

      switch (typeof sql) {
        case 'string':
          sqlStr = sql
          break
        case 'object':
          if (typeof sql.onResult === 'function') {
            sql.onResult = wrapCallback(sql.onResult)
          }
          sqlStr = sql.sql
          break
        case 'function':
          arguments[0] = wrapCallback(sql)
          break
      }

      if (span && sqlStr) {
        agent.logger.debug('extracted sql from mysql2 query %o', { id: id, sql: sqlStr })
        span.setDbContext({ statement: sqlStr, type: 'sql' })
        span.name = sqlSummary(sqlStr)
      }

      if (typeof values === 'function') {
        arguments[1] = wrapCallback(values)
      } else if (typeof cb === 'function') {
        arguments[2] = wrapCallback(cb)
      }

      var result = original.apply(this, arguments)
      if (result && !hasCallback) {
        ins.bindEmitter(result)
        if (span) {
          shimmer.wrap(result, 'emit', function (original) {
            return function (event) {
              switch (event) {
                case 'error':
                case 'close':
                case 'end':
                  span.end()
              }
              return original.apply(this, arguments)
            }
          })
        }
      }

      return result

      function wrapCallback (cb) {
        hasCallback = true
        return agent._instrumentation.bindFunction(span ? wrappedCallback : cb)
        function wrappedCallback () {
          span.end()
          return cb.apply(this, arguments)
        }
      }
    }
  }
}
