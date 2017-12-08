'use strict'

var Instrumentation = require('../../lib/instrumentation')
var Filters = require('../../lib/filters')
var logger = require('../../lib/logger')

logger.init({ level: 'fatal' })

var noop = function () {}
var sharedInstrumentation

module.exports = function mockAgent (cb) {
  var agent = {
    serviceName: 'service-name',
    active: true,
    instrument: true,
    captureSpanStackTraces: true,
    abortedRequests: {
      active: false,
      errorThreshold: 250
    },
    _httpClient: {
      request: cb || noop
    },
    _ignoreUrlStr: [],
    _ignoreUrlRegExp: [],
    _ignoreUserAgentStr: [],
    _ignoreUserAgentRegExp: [],
    _platform: {},
    _filters: new Filters()
  }

  // We do not want to start the instrumentation multiple times during testing.
  // This would result in core functions being patched multiple times
  if (!sharedInstrumentation) {
    sharedInstrumentation = new Instrumentation(agent)
    agent._instrumentation = sharedInstrumentation
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildSpan = sharedInstrumentation.buildSpan.bind(sharedInstrumentation)
    agent._instrumentation.start()
  } else {
    sharedInstrumentation._agent = agent
    agent._instrumentation = sharedInstrumentation
    agent._instrumentation.currentTransaction = null
    agent._instrumentation._queue._clear()
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildSpan = sharedInstrumentation.buildSpan.bind(sharedInstrumentation)
  }

  return agent
}
