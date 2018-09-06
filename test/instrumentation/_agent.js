'use strict'

var Filters = require('../../lib/filters')
var Instrumentation = require('../../lib/instrumentation')
var mockClient = require('../_mock_http_client')
var consoleLogLevel = require('console-log-level')

var noop = function () {}
var sharedInstrumentation

module.exports = function mockAgent (expected, cb) {
  var agent = {
    _conf: {
      serviceName: 'service-name',
      active: true,
      instrument: true,
      captureSpanStackTraces: true,
      errorOnAbortedRequests: false,
      abortedErrorThreshold: 250,
      sourceLinesErrorAppFrames: 5,
      sourceLinesErrorLibraryFrames: 5,
      sourceLinesSpanAppFrames: 5,
      sourceLinesSpanLibraryFrames: 0,
      ignoreUrlStr: [],
      ignoreUrlRegExp: [],
      ignoreUserAgentStr: [],
      ignoreUserAgentRegExp: [],
      transactionSampleRate: 1.0,
      disableInstrumentations: []
    },
    _filters: new Filters(),
    _apmServer: mockClient(expected, cb || noop),
    logger: consoleLogLevel({
      level: 'fatal'
    })
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
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.buildSpan = sharedInstrumentation.buildSpan.bind(sharedInstrumentation)
  }

  return agent
}
