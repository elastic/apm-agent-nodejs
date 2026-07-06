/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// This instruments '@opentelemetry/sdk-metrics' to automatically add a metric
// reader to any `MeterProvider` created by user code. The added metric
// reader will export metrics to the configured APM server.
//
// This covers use case 1 in the OTel metrics spec:
// https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#exporter-installation
//
// Dev Note: This avoids instrumenting the `MeterProvider` used *internally*
// by the APM agent itself (see "lib/opentelemetry-metrics/index.js") because
// that file imports `MeterProvider` before the APM agent is started.

const semver = require('semver');

module.exports = function (mod, agent, { version, enabled }) {
  const log = agent.logger;

  if (!agent._conf.opentelemetryBridgeEnabled) {
    return mod;
  }
  if (!enabled) {
    return mod;
  }
  if (!agent._isMetricsEnabled()) {
    log.trace(
      'metrics are not enabled, skipping @opentelemetry/sdk-metrics instrumentation',
      version,
    );
    return mod;
  }
  // Minimum supported version is 2.0.0.
  if (!semver.satisfies(version, '>=2.0.0 <3', { includePrerelease: true })) {
    log.debug(
      '@opentelemetry/sdk-metrics@%s is not supported, skipping @opentelemetry/sdk-metrics instrumentation',
      version,
    );
    return mod;
  }

  // Only import anything `@opentelemetry/*` if `opentelemetryBridgeEnabled`.
  const { createOTelMetricReader } = require('../../../opentelemetry-metrics');

  class ApmMeterProvider extends mod.MeterProvider {
    constructor(options = {}) {
      // We create a new metric reader for each new MeterProvider instance,
      // because they shutdown independently -- they cannot be shared between
      // multiple MeterProviders. In OTel SDK 2.x readers can only be provided
      // via the constructor, so the agent's reader is appended to any the user
      // already configured.
      log.trace(
        '@opentelemetry/sdk-metrics ins: create Elastic APM MetricReader',
      );
      const readers = options.readers ? [...options.readers] : [];
      readers.push(createOTelMetricReader(agent));
      super({ ...options, readers });
    }
  }
  Object.defineProperty(mod, 'MeterProvider', {
    configurable: true,
    enumerable: true,
    get: function () {
      return ApmMeterProvider;
    },
  });

  return mod;
};
