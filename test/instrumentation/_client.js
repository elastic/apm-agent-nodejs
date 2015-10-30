'use strict'

var Instrumentation = require('../../lib/instrumentation')

var noop = function () {}

module.exports = function mockClient (cb) {
  var client = {
    active: true,
    _ff_instrument: true,
    _httpClient: {
      request: cb || noop
    },
    logger: require('console-log-level')({ level: 'fatal' })
  }
  client._instrumentation = new Instrumentation(client)
  return client
}
