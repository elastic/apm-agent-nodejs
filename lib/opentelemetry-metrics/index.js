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
const semver = require('semver');

const ElasticApmMetricExporter = require('./ElasticApmMetricExporter');

// `isOTelMetricsFeatSupported` is true if the agent's included OTel Metrics
// feature is supported. Currently this depends on the Node.js version supported
// by the Metrics SDK package.
const _supportRange = require('@opentelemetry/sdk-metrics/package.json').engines
  .node;
const isOTelMetricsFeatSupported = semver.satisfies(
  process.version,
  _supportRange,
);

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
  const meterProvider = new MeterProvider();
  meterProvider.addMetricReader(createOTelMetricReader(agent));
  return meterProvider;
}

module.exports = {
  isOTelMetricsFeatSupported,
  createOTelMetricReader,
  createOTelMeterProvider,
};
