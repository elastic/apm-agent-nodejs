'use strict'

var shimmer = require('shimmer')
var debug = require('debug')('opbeat')
var shared = require('../http-shared')

module.exports = function (http, agent) {
  debug('shimming http.Server.prototype.emit function')
  shimmer.wrap(http.Server.prototype, 'emit', shared.instrumentRequest(agent, 'http'))

  debug('shimming http.request function')
  shimmer.wrap(http, 'request', shared.traceOutgoingRequest(agent, 'http'))

  return http
}
