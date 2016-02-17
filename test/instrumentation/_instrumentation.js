'use strict'

var mockAgent = require('./_agent')

module.exports = function mockInstrumentation (cb) {
  var agent = mockAgent()
  agent._instrumentation.addEndedTransaction = cb
  return agent._instrumentation
}
