'use strict'

var Instrumentation = require('../../lib/instrumentation')

var noop = function () {}

module.exports = function mockAgent (cb) {
  var agent = {
    active: true,
    _ff_instrument: true,
    _httpClient: {
      request: cb || noop
    },
    logger: require('console-log-level')({ level: 'fatal' })
  }
  agent._instrumentation = new Instrumentation(agent)
  return agent
}
