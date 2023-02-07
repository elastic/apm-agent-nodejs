/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const otel = require('@opentelemetry/api')
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')

const ElasticApmMetricExporter = require('./ElasticApmMetricExporter')

function setupOTelMeterProvider (agent) {
  const metricsInterval = agent._conf.metricsInterval
  const meterProvider = new MeterProvider()
  meterProvider.addMetricReader(new PeriodicExportingMetricReader({
    exporter: new ElasticApmMetricExporter(agent),
    exportIntervalMillis: metricsInterval * 1000,
    exportTimeoutMillis: metricsInterval / 2 * 1000
  }))
  otel.metrics.setGlobalMeterProvider(meterProvider)
}

module.exports = {
  setupOTelMeterProvider
}
