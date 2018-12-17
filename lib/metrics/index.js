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
    const metricsInterval = this[agentSymbol]._conf.metricsInterval
    this[registrySymbol] = new MetricsRegistry(this[agentSymbol]._transport, {
      reporterOptions: {
        defaultReportingIntervalInSeconds: metricsInterval,
        enabled: metricsInterval !== 0,
        unrefTimers: true
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
