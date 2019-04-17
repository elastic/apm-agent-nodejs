'use strict'

const os = require('os')

const { SelfReportingMetricsRegistry } = require('measured-reporting')

const MetricsReporter = require('./reporter')
const createRuntimeMetrics = require('./runtime')
const createSystemMetrics = process.platform === 'linux'
  ? require('./platforms/linux')
  : require('./platforms/generic')

const defaultReporterOptions = {
  defaultDimensions: {
    hostname: os.hostname(),
    env: process.env.NODE_ENV || 'development' // TODO: Use environment config option once it lands
  }
}

class MetricsRegistry extends SelfReportingMetricsRegistry {
  constructor (transport, { reporterOptions, registryOptions } = {}) {
    const options = Object.assign({}, defaultReporterOptions, reporterOptions)
    const reporter = new MetricsReporter(transport, options)
    super(reporter, registryOptions)
    this.collectors = []
    if (options.enabled) {
      const interval = options.defaultReportingIntervalInSeconds
      createSystemMetrics(this, interval)
      createRuntimeMetrics(this, interval)
    }
  }

  shutdown () {
    for (const collector of this.collectors) {
      collector.stop()
    }

    return super.shutdown()
  }
}

module.exports = MetricsRegistry
