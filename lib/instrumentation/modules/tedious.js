'use strict'

var semver = require('semver')
var clone = require('shallow-clone-shim')
var sqlSummary = require('sql-summary')

module.exports = function (tedious, agent, { version, enabled }) {
  if (!enabled) return tedious
  if (!semver.satisfies(version, '>=0.0.5')) {
    agent.logger.debug('tedious version %s not supported - aborting...', version)
    return tedious
  }

  const ins = agent._instrumentation

  return clone({}, tedious, {
    Connection (descriptor) {
      const getter = descriptor.get
      if (getter) {
        // tedious v6.5.0+
        descriptor.get = function get () {
          return wrapConnection(getter())
        }
      } else if (typeof descriptor.value === 'function') {
        descriptor.value = wrapConnection(descriptor.value)
      } else {
        agent.logger.debug('could not patch `tedious.Connection` property for tedious version %s - aborting...', version)
      }
      return descriptor
    },
    Request (descriptor) {
      const getter = descriptor.get
      if (getter) {
        // tedious v6.5.0+
        descriptor.get = function get () {
          return wrapRequest(getter())
        }
      } else if (typeof descriptor.value === 'function') {
        descriptor.value = wrapRequest(descriptor.value)
      } else {
        agent.logger.debug('could not patch `tedious.Request` property for tedious version %s - aborting...', version)
      }
      return descriptor
    }
  })

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
