'use strict'

var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')
var shared = require('../http-shared')

module.exports = function (http, agent) {
  debug('shimming http.Server.prototype.emit function')
  shimmer.wrap(http && http.Server && http.Server.prototype, 'emit', shared.instrumentRequest(agent, 'http'))

  debug('shimming http.request function')
  shimmer.wrap(http, 'request', shared.traceOutgoingRequest(agent, 'http'))

  debug('shimming http.ServerResponse.prototype.writeHead function')
  shimmer.wrap(http && http.ServerResponse && http.ServerResponse.prototype, 'writeHead', wrapWriteHead)

  return http

  function wrapWriteHead (original) {
    return function wrappedWriteHead () {
      var headers = arguments.length === 1
        ? this._headers // might be because of implicit headers
        : arguments[arguments.length - 1]

      var result = original.apply(this, arguments)

      var trans = agent._instrumentation.currentTransaction

      if (trans) trans.result = this.statusCode

      // End transacton early in case of SSE
      if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
        Object.keys(headers).some(function (key) {
          if (key.toLowerCase() !== 'content-type') return false
          if (String(headers[key]).toLowerCase().indexOf('text/event-stream') !== 0) return false
          var uuid = trans && trans._uuid
          debug('detected SSE response - ending transaction %o', { uuid: uuid })
          agent.endTransaction()
          return true
        })
      }

      return result
    }
  }
}
