'use strict'

const Stats = require('./stats')

module.exports = function createSystemMetrics (registry) {
  const stats = new Stats()

  registry.registerCollector(stats)

  for (const metric of Object.keys(stats.toJSON())) {
    registry.getOrCreateGauge(metric, () => stats.toJSON()[metric])
  }
}
