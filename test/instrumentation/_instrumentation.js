'use strict'

var mockClient = require('./_client')

module.exports = function mockInstrumentation (cb) {
  var client = mockClient()
  var ins = {
    add: cb,
    _client: client
  }
  client._instrumentation = ins
  return ins
}
