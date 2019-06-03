'use strict'

const Stats = require('./stats')

module.exports = function createSystemMetrics (registry, reportingIntervalInSeconds) {
  const stats = new Stats()
  stats.start(reportingIntervalInSeconds)

  const metrics = [
    'system.cpu.total.norm.pct',
    'system.memory.total',
    'system.memory.actual.free',
    'system.process.cpu.total.norm.pct',
    'system.process.memory.size',
    'system.process.memory.rss.bytes'
  ]

  for (let metric of metrics) {
    registry.getOrCreateGauge(metric, () => stats.toJSON()[metric])
  }

  registry.collector = stats
}
