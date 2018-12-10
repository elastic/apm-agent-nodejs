'use strict'

const os = require('os')

const { SelfReportingMetricsRegistry } = require('measured-reporting')

const MetricsReporter = require('./reporter')
const cpu = require('./cpu')

function createSystemMetrics (registry) {
  // Base system metrics
  registry.getOrCreateGauge(
    'system.cpu.total.norm.pct',
    () => cpu.systemPercent
  )
  registry.getOrCreateGauge(
    'system.memory.total',
    () => os.totalmem()
  )
  registry.getOrCreateGauge(
    'system.memory.actual.free',
    () => os.freemem()
  )

  // Process metrics
  registry.getOrCreateGauge(
    'system.process.cpu.total.norm.pct',
    () => cpu.processPercent
  )
  registry.getOrCreateGauge(
    'system.process.memory.size',
    () => process.memoryUsage().heapUsed
  )
  registry.getOrCreateGauge(
    'system.process.memory.rss.bytes',
    () => process.memoryUsage().rss
  )
}

const defaultReporterOptions = {
  defaultDimensions: {
    hostname: os.hostname(),
    env: process.env.NODE_ENV || 'development'
  }
}

class MetricsRegistry extends SelfReportingMetricsRegistry {
  constructor (transport, { reporterOptions, registryOptions } = {}) {
    const options = Object.assign({}, defaultReporterOptions, reporterOptions)
    const reporter = new MetricsReporter(transport, options)
    super(reporter, registryOptions)
    createSystemMetrics(this)
  }
}

module.exports = MetricsRegistry
