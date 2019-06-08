'use strict'

const os = require('os')

const semver = require('semver')

module.exports = function createSystemMetrics (registry) {
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
    const processCpu = require('./process-cpu')
    registry.getOrCreateGauge(
      'system.process.cpu.total.norm.pct',
      processCpu.total
    )
    registry.getOrCreateGauge(
      'system.process.cpu.system.norm.pct',
      processCpu.system
    )
    registry.getOrCreateGauge(
      'system.process.cpu.user.norm.pct',
      processCpu.user
    )
  }
  registry.getOrCreateGauge(
    'system.process.memory.rss.bytes',
    () => process.memoryUsage().rss
  )
}
