'use strict'

const os = require('os')

const { SelfReportingMetricsRegistry } = require('measured-reporting')
const semver = require('semver')

const MetricsReporter = require('./reporter')

function createSystemMetrics (registry) {
  // Base system metrics
  registry.getOrCreateGauge(
    'system.cpu.total.norm.pct',
    require('./system-cpu')
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
  // NOTE: Process CPU metrics are not supported on 6.0.x
  if (semver.satisfies(process.versions.node, '>=6.1')) {
    registry.getOrCreateGauge(
      'system.process.cpu.total.norm.pct',
      require('./process-cpu')
    )
  }
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
