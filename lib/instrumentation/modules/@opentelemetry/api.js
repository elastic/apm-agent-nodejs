/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Instrument `.metrics.getMeterProvider()` from `@opentelemetry/api` to
// provide an Elastic APM provider if user code hasn't registered one itself.
//
// This covers use case 2 in the OTel metrics spec:
// https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#exporter-installation

const semver = require('semver');

const {
  isOTelMetricsFeatSupported,
} = require('../../../opentelemetry-metrics');
const shimmer = require('../../shimmer');

/**
 * `otel.metrics.getMeterProvider()` returns a singleton instance of the
 * internal `NoopMeterProvider` class if no global meter provider has been
 * set. There isn't an explicitly API to determine if a provider is a noop
 * one. This function attempts to sniff that out.
 *
 * We cannot rely on comparing to the `NOOP_METER_PROVIDER` exported by
 * "src/metrics/NoopMeterProvider.ts" because there might be multiple
 * "@opentelemetry/api" packages in play.
 *
 * @param {import('@opentelemetry/api').MeterProvider}
 * @returns {boolean}
 */
function isNoopMeterProvider(provider) {
  return !!(
    provider &&
    provider.constructor &&
    provider.constructor.name === 'NoopMeterProvider'
  );
}

module.exports = function (mod, agent, { version, enabled }) {
  const log = agent.logger;

  if (!enabled) {
    return mod;
  }
  if (!agent._isMetricsEnabled()) {
    log.trace(
      'metrics are not enabled, skipping @opentelemetry/api instrumentation',
      version,
    );
    return mod;
  }
  if (!semver.satisfies(version, '>=1.3.0 <2', { includePrerelease: true })) {
    log.debug(
      '@opentelemetry/api version %s not supported, skipping @opentelemetry/api instrumentation',
      version,
    );
    return mod;
  }
  if (!isOTelMetricsFeatSupported) {
    log.debug(
      'elastic-apm-node OTel Metrics support does not support node %s, skipping @opentelemetry/api instrumentation',
      process.version,
    );
    return mod;
  }

  log.debug('shimming @opentelemetry/api .metrics.getMeterProvider()');
  shimmer.wrap(mod.metrics, 'getMeterProvider', wrapGetMeterProvider);

  return mod;

  function wrapGetMeterProvider(orig) {
    return function wrappedGetMeterProvider() {
      const provider = orig.apply(this, arguments);
      if (!isNoopMeterProvider(provider)) {
        return provider;
      }
      const elMeterProvider = agent._getOrCreateOTelMeterProvider();
      return elMeterProvider || provider;
    };
  }
};
