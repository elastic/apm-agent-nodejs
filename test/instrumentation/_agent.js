'use strict'

var config = require('../../lib/config')
var Metrics = require('../../lib/metrics')
var Instrumentation = require('../../lib/instrumentation')
var mockClient = require('../_mock_http_client')

var Filters = require('object-filter-sequence')
var pino = require('pino')

var noop = function () {}
var sharedInstrumentation

module.exports = function mockAgent (expected, cb) {
  var agent = {
    _conf: config({
      abortedErrorThreshold: '250ms',
      centralConfig: false,
      errorOnAbortedRequests: false,
      metricsInterval: 0
    }),
    _errorFilters: new Filters(),
    _transactionFilters: new Filters(),
    _spanFilters: new Filters(),
    _transport: mockClient(expected, cb || noop),
    logger: pino({
      level: 'silent'
    }),
    setFramework: function () {}
  }

  agent._metrics = new Metrics(agent)
  agent._metrics.start()

  Object.defineProperty(agent, 'currentTransaction', {
    get () {
      return agent._instrumentation.currentTransaction
    }
  })

  // We do not want to start the instrumentation multiple times during testing.
  // This would result in core functions being patched multiple times
  if (!sharedInstrumentation) {
    sharedInstrumentation = new Instrumentation(agent)
    agent._instrumentation = sharedInstrumentation
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.startSpan = sharedInstrumentation.startSpan.bind(sharedInstrumentation)
    agent._instrumentation.start()
  } else {
    sharedInstrumentation._agent = agent
    agent._instrumentation = sharedInstrumentation
    agent._instrumentation.currentTransaction = null
    agent.startTransaction = sharedInstrumentation.startTransaction.bind(sharedInstrumentation)
    agent.endTransaction = sharedInstrumentation.endTransaction.bind(sharedInstrumentation)
    agent.setTransactionName = sharedInstrumentation.setTransactionName.bind(sharedInstrumentation)
    agent.startSpan = sharedInstrumentation.startSpan.bind(sharedInstrumentation)
  }

  return agent
}
