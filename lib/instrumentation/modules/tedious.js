'use strict'

var inherits = require('util').inherits

var semver = require('semver')
var sqlSummary = require('sql-summary')

var shimmer = require('../shimmer')

module.exports = function (tedious, agent, version, enabled) {
  if (!enabled) return tedious
  if (!semver.satisfies(version, '>=0.0.5')) {
    agent.logger.debug('tedious version %s not supported - aborting...', version)
    return tedious
  }

  const ins = agent._instrumentation
  agent.logger.debug('shimming tedious.Connection')
  shimmer.wrap(tedious, 'Connection', wrapConnection)
  shimmer.wrap(tedious, 'Request', wrapRequest)

  return tedious

  function wrapRequest (OriginalRequest) {
    function Request () {
      OriginalRequest.apply(this, arguments)
      ins.bindEmitter(this)
    }
    inherits(Request, OriginalRequest)
    return Request
  }

  function wrapConnection (OriginalConnection) {
    function Connection () {
      OriginalConnection.apply(this, arguments)
      ins.bindEmitter(this)
    }
    inherits(Connection, OriginalConnection)

    const originalMakeRequest = OriginalConnection.prototype.makeRequest
    Connection.prototype.makeRequest = function makeRequest (request) {
      const span = agent.startSpan(null, 'db.mssql.query')
      if (!span) {
        return originalMakeRequest.apply(this, arguments)
      }

      const preparing = request.sqlTextOrProcedure === 'sp_prepare'
      const params = request.parametersByName
      const sql = (params.statement || params.stmt || {}).value
      span.name = sqlSummary(sql) + (preparing ? ' (prepare)' : '')
      span.setDbContext({ statement: sql, type: 'sql' })

      request.userCallback = wrapCallback(request.userCallback)

      return originalMakeRequest.apply(this, arguments)

      function wrapCallback (cb) {
        return function () {
          span.end()
          return cb && cb.apply(this, arguments)
        }
      }
    }

    return Connection
  }
}
