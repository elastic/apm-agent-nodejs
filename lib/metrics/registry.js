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
    this._registry.collectors = [
      createSystemMetrics(this),
      createRuntimeMetrics(this)
    ].filter(v => !!v)
  }
}

module.exports = MetricsRegistry
