'use strict'

const { Reporter } = require('measured-reporting')

class MetricsReporter extends Reporter {
  constructor (transport, options = {}) {
    super(options)
    this.enabled = options.enabled
    this.transport = transport

    if (!this.enabled) {
      this.shutdown()
    }
  }

  _reportMetrics (metrics) {
    const data = {
      timestamp: Date.now() * 1000,
      tags: this._getDimensions(metrics),
      samples: {}
    }

    metrics.forEach(metric => {
      data.samples[metric.name] = {
        value: metric.metricImpl.toJSON()
      }
    })

    if (this.enabled) {
      this.transport.sendMetricSet(data)
    }
  }
}

module.exports = MetricsReporter
