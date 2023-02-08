/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// XXX overview of the OTel Metrics support

const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const semver = require('semver')

const ElasticApmMetricExporter = require('./ElasticApmMetricExporter')

const _supportRange = require('@opentelemetry/sdk-metrics/package.json').engines.node
const isOTelMeterProviderSupported = semver.satisfies(process.version, _supportRange)

function createOTelMeterProvider (agent) {
  const metricsInterval = agent._conf.metricsInterval
  const meterProvider = new MeterProvider()
  meterProvider.addMetricReader(new PeriodicExportingMetricReader({
    exporter: new ElasticApmMetricExporter(agent),
    exportIntervalMillis: metricsInterval * 1000,
    exportTimeoutMillis: metricsInterval / 2 * 1000
  }))
  return meterProvider
}

module.exports = {
  isOTelMeterProviderSupported,
  createOTelMeterProvider
}
