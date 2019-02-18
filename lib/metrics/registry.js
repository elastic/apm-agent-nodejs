'use strict'

const os = require('os')

const { SelfReportingMetricsRegistry } = require('measured-reporting')

const MetricsReporter = require('./reporter')
const createSystemMetrics = process.platform === 'linux'
  ? require('./platforms/linux')
  : require('./platforms/generic')

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
    createSystemMetrics(this, options.defaultReportingIntervalInSeconds)
  }

  shutdown () {
    if (this.collector) {
      this.collector.stop()
    }

    return super.shutdown()
  }
}

module.exports = MetricsRegistry
