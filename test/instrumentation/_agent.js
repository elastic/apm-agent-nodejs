'use strict'

var Instrumentation = require('../../lib/instrumentation')
var logger = require('../../lib/logger')

logger.init({ level: 'fatal' })

var noop = function () {}

module.exports = function mockAgent (cb) {
  var agent = {
    active: true,
    instrument: true,
    _httpClient: {
      request: cb || noop
    }
  }
  agent._instrumentation = new Instrumentation(agent)
  agent._instrumentation.start()
  return agent
}
