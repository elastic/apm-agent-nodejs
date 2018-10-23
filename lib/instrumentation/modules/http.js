'use strict'

var httpShared = require('../http-shared')
var shimmer = require('../shimmer')

module.exports = function (http, agent, version, enabled) {
  var disableTransactions = agent._conf.disableTransactions
  if (!disableTransactions.has('http')) {
    agent.logger.debug('shimming http.Server.prototype.emit function')
    shimmer.wrap(http && http.Server && http.Server.prototype, 'emit', httpShared.instrumentRequest(agent, 'http'))

    httpShared.instrumentWriteHead(agent, http && http.ServerResponse)
  }

  if (!enabled) return http

  agent.logger.debug('shimming http.request function')
  shimmer.wrap(http, 'request', httpShared.traceOutgoingRequest(agent, 'http'))

  return http
}
