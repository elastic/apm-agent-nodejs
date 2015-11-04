'use strict'

var mockAgent = require('./_agent')

module.exports = function mockInstrumentation (cb) {
  var agent = mockAgent()
  var ins = {
    addEndedTransaction: cb,
    _agent: agent
  }
  agent._instrumentation = ins
  return ins
}
