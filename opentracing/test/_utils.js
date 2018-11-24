'use strict'

const Filters = require('../../lib/filters')
const symbols = require('../../lib/symbols')

exports.setup = setup

let uncaughtExceptionListeners = process._events.uncaughtException

function setup (runTest) {
  return function (t) {
    uncaughtExceptionListeners = process._events.uncaughtException
    process.removeAllListeners('uncaughtException')

    runTest(t, function (agent) {
      t.on('end', function () {
        clean(agent)
      })
      t.end()
    })
  }
}

function clean (agent) {
  global[symbols.agentInitialized] = null
  process._events.uncaughtException = uncaughtExceptionListeners
  if (agent) {
    agent._errorFilters = new Filters()
    agent._transactionFilters = new Filters()
    agent._spanFilters = new Filters()
    if (agent._instrumentation && agent._instrumentation._hook) {
      agent._instrumentation._hook.unhook()
    }
  }
}
