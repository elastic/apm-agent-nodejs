'use strict'

var Agent = require('../lib/agent')

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
  global._elastic_apm_initialized = null
  process._events.uncaughtException = uncaughtExceptionListeners
  if (agent) agent._filters = []
}
