/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const assert = require('assert');

function createOTelMetricReader(agent) {
  // Lazy-import `@opentelemetry/sdk-metrics` to avoid interaction with
  // require-in-the-middle hooking of it. Also to avoid any
  // import of `@opentelemetry/*` unless `opentelemetryBridgeEnabled`.
  const {
    PeriodicExportingMetricReader,
  } = require('@opentelemetry/sdk-metrics');
  const ElasticApmMetricExporter = require('./ElasticApmMetricExporter');

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
  // Lazy-import `@opentelemetry/sdk-metrics` to avoid interaction with
  // require-in-the-middle hooking of it. Also to avoid any
  // import of `@opentelemetry/*` unless `opentelemetryBridgeEnabled`.
  const { MeterProvider } = require('@opentelemetry/sdk-metrics');

  const meterProvider = new MeterProvider({
    readers: [createOTelMetricReader(agent)],
  });
  return meterProvider;
}

module.exports = {
  createOTelMetricReader,
  createOTelMeterProvider,
};
