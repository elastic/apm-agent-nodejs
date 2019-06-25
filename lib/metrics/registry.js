'use strict'

const os = require('os')

const { SelfReportingMetricsRegistry } = require('measured-reporting')

const MetricsReporter = require('./reporter')
const createSystemMetrics = process.platform === 'linux'
  ? require('./platforms/linux')
  : require('./platforms/generic')

class MetricsRegistry extends SelfReportingMetricsRegistry {
  constructor (agent, { reporterOptions, registryOptions } = {}) {
    const defaultReporterOptions = {
      defaultDimensions: {
        hostname: agent._conf.hostname || os.hostname(),
        env: agent._conf.environment || ''
      }
    }

    const options = Object.assign({}, defaultReporterOptions, reporterOptions)
    const reporter = new MetricsReporter(agent._transport, options)

    super(reporter, registryOptions)

    if (options.enabled) createSystemMetrics(this, options.defaultReportingIntervalInSeconds)
  }

  shutdown () {
    if (this.collector) {
      this.collector.stop()
    }

    return super.shutdown()
  }
}

module.exports = MetricsRegistry
