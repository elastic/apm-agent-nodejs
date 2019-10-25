'use strict'

var semver = require('semver')
var sqlSummary = require('sql-summary')

module.exports = function (tedious, agent, { version, enabled }) {
  if (!enabled) return tedious
  if (!semver.satisfies(version, '>=0.0.5')) {
    agent.logger.debug('tedious version %s not supported - aborting...', version)
    return tedious
  }

  const ins = agent._instrumentation

  // NOTE: shimmer doesn't work because the TypeScript build used in tedious
  // locks the property descriptors of all exports, preventing re-assignment.
  return {
    ...tedious,
    Connection: wrapConnection(tedious.Connection),
    Request: wrapRequest(tedious.Request)
  }

  function wrapRequest (OriginalRequest) {
    class Request extends OriginalRequest {
      constructor () {
        super(...arguments)
        ins.bindEmitter(this)
      }
    }

    return Request
  }

  function wrapConnection (OriginalConnection) {
    class Connection extends OriginalConnection {
      constructor () {
        super(...arguments)
        ins.bindEmitter(this)
      }

      makeRequest (request) {
        const span = agent.startSpan(null, 'db', 'mssql', 'query')
        if (!span) {
          return super.makeRequest(...arguments)
        }

        const preparing = request.sqlTextOrProcedure === 'sp_prepare'
        const params = request.parametersByName
        const sql = (params.statement || params.stmt || {}).value
        span.name = sqlSummary(sql) + (preparing ? ' (prepare)' : '')
        span.setDbContext({ statement: sql, type: 'sql' })

        request.userCallback = wrapCallback(request.userCallback)

        return super.makeRequest(...arguments)

        function wrapCallback (cb) {
          return function () {
            span.end()
            return cb && cb.apply(this, arguments)
          }
        }
      }
    }

    return Connection
  }
}
