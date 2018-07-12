'use strict'

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
    return class Request extends OriginalRequest {
      constructor (sql, callback) {
        super(sql, callback)
        ins.bindEmitter(this)
      }
    }
  }

  function wrapConnection (OriginalConnection) {
    return class Connection extends OriginalConnection {
      constructor (config) {
        super(config)
        ins.bindEmitter(this)
      }

      makeRequest (request) {
        const span = agent.buildSpan()
        if (!span) {
          return super.makeRequest.apply(this, arguments)
        }

        const params = request.parametersByName
        const sql = (params.statement || params.stmt || {}).value
        span.setDbContext({ statement: sql, type: 'sql' })
        span.start(sqlSummary(sql), 'db.mssql.query')

        request.userCallback = wrapCallback(request.userCallback)

        return super.makeRequest.apply(this, arguments)

        function wrapCallback (cb) {
          return function () {
            span.end()
            return cb && cb.apply(this, arguments)
          }
        }
      }
    }
  }
}
