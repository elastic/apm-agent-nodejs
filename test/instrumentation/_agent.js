'use strict'

var Instrumentation = require('../../lib/instrumentation')
var Filters = require('../../lib/filters')
var logger = require('../../lib/logger')

logger.init({ level: 'fatal' })

var noop = function () {}
var sharedInstrumentation

module.exports = function mockAgent (cb) {
  var agent = {
    _conf: {
      appName: 'app-name',
      active: true,
      instrument: true,
      captureTraceStackTraces: true,
      errorOnAbortedRequests: false,
      abortedErrorThreshold: 250,
      ignoreUrlStr: [],
      ignoreUrlRegExp: [],
      ignoreUserAgentStr: [],
      ignoreUserAgentRegExp: []
    },
    _platform: {},
    _filters: new Filters(),
    _httpClient: {
      request: cb || noop
    }
  }

  // We do not want to start the instrumentation multiple times during testing.
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
    agent._instrumentation.currentTransaction = null
    agent._instrumentation._queue._clear()
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildTrace = sharedInstrumentation.buildTrace.bind(sharedInstrumentation)
  }

  return agent
}
