'use strict'

const MetricsRegistry = require('./registry')

const registrySymbol = Symbol('metrics-registry')
const agentSymbol = Symbol('metrics-agent')

class NoopLogger {
  debug () { }
  error () { }
  fatal () { }
  info () { }
  trace () { }
  warn () { }
}

class Metrics {
  constructor (agent) {
    this[agentSymbol] = agent
    this[registrySymbol] = null
  }

  start (refTimers) {
    const metricsInterval = this[agentSymbol]._conf.metricsInterval
    this[registrySymbol] = new MetricsRegistry(this[agentSymbol], {
      reporterOptions: {
        defaultReportingIntervalInSeconds: metricsInterval,
        enabled: metricsInterval !== 0,
        unrefTimers: !refTimers,
        logger: new NoopLogger()
      }
    })
  }

  stop () {
    if (this[registrySymbol]) {
      this[registrySymbol].shutdown()
      this[registrySymbol] = null
    }
  }

  getOrCreateCounter (...args) {
    return this[registrySymbol].getOrCreateCounter(...args)
  }

  incrementCounter (name, dimensions, amount = 1) {
    if (!this[registrySymbol]) {
      return
    }

    this.getOrCreateCounter(name, dimensions).inc(amount)
  }
}

module.exports = Metrics
