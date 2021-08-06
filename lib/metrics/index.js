'use strict'

const MetricsRegistry = require('./registry')
const { createQueueMetrics } = require('./queue')

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
    const enabled = metricsInterval !== 0 && !this[agentSymbol]._conf.disableSend
    if (enabled) {
      // XXX Otherwise get this every 10s:
      //    /Users/trentm/el/apm-agent-nodejs11/node_modules/measured-reporting/lib/reporters/Reporter.js in _createIntervalCallback interval
      // because I assume the SelfReportingMetricsRegistry is reading
      // `defaultReportingIntervalInSeconds: 0` as false, falling back to
      // default 10 and partially enabling.
      this[registrySymbol] = new MetricsRegistry(this[agentSymbol], {
        reporterOptions: {
          defaultReportingIntervalInSeconds: metricsInterval,
          enabled: enabled,
          unrefTimers: !refTimers,
          logger: new NoopLogger()
        }
      })
    }
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

  getOrCreateGauge (...args) {
    return this[registrySymbol].getOrCreateGauge(...args)
  }

  // factory function for creating a queue metrics collector
  //
  // called from instrumentation, only when the agent receives a queue message
  createQueueMetricsCollector (queueOrTopicName) {
    const collector = createQueueMetrics(queueOrTopicName, this[registrySymbol])
    return collector
  }
}

module.exports = Metrics
