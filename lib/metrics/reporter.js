'use strict'

const { Reporter } = require('measured-reporting')

class MetricsReporter extends Reporter {
  constructor (transport, options) {
    super(options)
    this.transport = transport
  }

  _reportMetrics (metrics) {
    const data = {
      timestamp: Date.now(),
      tags: this._getDimensions(metrics),
      samples: {}
    }

    metrics.forEach(metric => {
      data.samples[metric.name] = {
        value: metric.metricImpl.toJSON()
      }
    })

    console.log('reporting', data)
    // this.transport.sendMetricSet(data)
  }
}

module.exports = MetricsReporter
