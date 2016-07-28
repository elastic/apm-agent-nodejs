'use strict'

var Instrumentation = require('../../lib/instrumentation')
var logger = require('../../lib/logger')

logger.init({ level: 'fatal' })

var noop = function () {}
var sharedInstrumentation

module.exports = function mockAgent (cb) {
  var agent = {
    active: true,
    instrument: true,
    timeout: {
      active: false,
      errorResult: 42,
      errorThreshold: 250
    },
    _httpClient: {
      request: cb || noop
    }
  }

  // We do not want to start the instrumenation multiple times during testing.
  // This would result in core functions being patched multiple times
  if (!sharedInstrumentation) {
    sharedInstrumentation = new Instrumentation(agent)
    agent._instrumentation = sharedInstrumentation
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildTrace = sharedInstrumentation.buildTrace.bind(sharedInstrumentation)
    agent._instrumentation.start()
  } else {
    sharedInstrumentation._agent = agent
    agent._instrumentation = sharedInstrumentation
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildTrace = sharedInstrumentation.buildTrace.bind(sharedInstrumentation)
  }

  return agent
}
