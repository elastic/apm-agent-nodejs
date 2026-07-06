/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const assert = require('assert');

const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');

const ElasticApmMetricExporter = require('./ElasticApmMetricExporter');

function createOTelMetricReader(agent) {
  const metricsInterval = agent._conf.metricsInterval;
  assert(
    metricsInterval > 0,
    'createOTelMeterProvider() should not be called if metricsInterval <= 0',
  );
  return new PeriodicExportingMetricReader({
    exporter: new ElasticApmMetricExporter(agent),
    exportIntervalMillis: metricsInterval * 1000,
    exportTimeoutMillis: (metricsInterval / 2) * 1000,
  });
}

function createOTelMeterProvider(agent) {
  const meterProvider = new MeterProvider({
    readers: [createOTelMetricReader(agent)],
  });
  return meterProvider;
}

module.exports = {
  createOTelMetricReader,
  createOTelMeterProvider,
};
