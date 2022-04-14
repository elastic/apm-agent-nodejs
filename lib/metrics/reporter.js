'use strict'

const afterAll = require('after-all-results')
const { Reporter } = require('measured-reporting')
const ObjectIdentityMap = require('object-identity-map')

class MetricsReporter extends Reporter {
  constructor (agent, options = {}) {
    super(options)
    this.enabled = options.enabled
    this._agent = agent

    if (!this.enabled) {
      this.shutdown()
    }
  }

  _reportMetrics (metrics) {
    if (!this.enabled) return

    const baseDimensions = {
      timestamp: Date.now() * 1000,
      tags: this._getDimensions(metrics)
    }

    const next = afterAll(() => {
      const seen = new ObjectIdentityMap()

      for (const metric of metrics) {
        // Due to limitations in measured-reporting, metrics dropped
        // due to `metricsLimit` leave empty slots in the list.
        if (!metric) continue

        if (this.isStaleMetric(metric)) {
          this.removeMetricFromRegistry(metric, this._registry)
          continue
        }

        const data = seen.ensure(metric.dimensions, () => {
          const metricData = unflattenBreakdown(metric.dimensions)
          const merged = Object.assign({ samples: {} }, baseDimensions, metricData)
          Object.assign(merged.tags, baseDimensions.tags, metricData.tags)
          return merged
        })

        data.samples[metric.name] = {
          value: metric.metricImpl.toJSON()
        }

        if (metric.metricImpl.constructor.name === 'Counter') {
          // We need a way to avoid ignoring metrics that might go stale
          // because we want values for each counter to appear in every document
          // This is not a great check but there does not seem to be a way
          // to provide meta data about a metric to enable to better check
          if (!metric.name.startsWith('kibana')) {
            metric.metricImpl.reset()
          }
        }
      }

      if (this._agent._transport) {
        for (const metric of seen.values()) {
          this._agent._transport.sendMetricSet(metric)
        }
      }
    })

    for (const collector of this._registry.collectors) {
      collector.collect(next())
    }
  }

  isStaleMetric (metric) {
    // if a metric is a counting metric and that count is
    // zero, then the metric is considered stale
    if (metric.metricImpl && metric.metricImpl._count === 0) {
      // We need a way to avoid ignoring metrics that might go stale
      // because we want values for each counter to appear in every document
      // This is not a great check but there does not seem to be a way
      // to provide meta data about a metric to enable to better check
      if (metric.name.startsWith('kibana')) return false
      return true
    }
    return false
  }

  removeMetricFromRegistry (metric) {
    if (!this._registry || !this._registry._metrics) {
      return
    }
    const key = this._registry._generateStorageKey(metric.name, metric.dimensions)
    return this._registry._metrics.delete(key)
  }
}

module.exports = MetricsReporter

function unflattenBreakdown (source) {
  const target = {
    tags: {}
  }

  for (const [key, value] of Object.entries(source)) {
    if (key.includes('::')) {
      const [parent, child] = key.split('::')
      if (!target[parent]) target[parent] = {}
      target[parent][child] = value
    } else {
      target.tags[key] = value
    }
  }

  return target
}
