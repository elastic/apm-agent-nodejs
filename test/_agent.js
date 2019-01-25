'use strict'

var Agent = require('../lib/agent')
var Filters = require('../lib/filters')
var symbols = require('../lib/symbols')

var uncaughtExceptionListeners = process._events.uncaughtException
var agent

module.exports = setup

function setup () {
  clean()
  uncaughtExceptionListeners = process._events.uncaughtException
  process.removeAllListeners('uncaughtException')
  agent = new Agent()
  return agent
}

function clean () {
  global[symbols.agentInitialized] = null
  process._events.uncaughtException = uncaughtExceptionListeners
  if (agent) {
    agent._errorFilters = new Filters()
    agent._transactionFilters = new Filters()
    agent._spanFilters = new Filters()
    if (agent._instrumentation && agent._instrumentation._hook) {
      agent._instrumentation._hook.unhook()
    }
    agent._metrics.stop()
  }
}
