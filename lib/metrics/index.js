'use strict'

const MetricsRegistry = require('./registry')

const registrySymbol = Symbol('metrics-registry')
const agentSymbol = Symbol('metrics-agent')

class Metrics {
  constructor (agent) {
    this[agentSymbol] = agent
    this[registrySymbol] = undefined
  }

  start () {
    this[registrySymbol] = new MetricsRegistry(this[agentSymbol]._transport, {
      reporterOptions: {
        defaultReportingIntervalInSeconds: this[agentSymbol]._conf.metricsInterval || 10
      }
    })
  }

  stop () {
    if (this[registrySymbol]) {
      this[registrySymbol].shutdown()
      this[registrySymbol] = undefined
    }
  }

  getOrCreateCounter (...args) {
    return this[registrySymbol].getOrCreateCounter(...args)
  }
}

module.exports = Metrics
