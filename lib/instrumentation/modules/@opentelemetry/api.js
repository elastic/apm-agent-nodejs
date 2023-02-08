/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// XXX this whole thing

'use strict'

// Instrument `.metrics.getMeterProvider()` from `@opentelemetry/api` to
// provide an Elastic APM provider if user code hasn't registered one itself.
//
// Spec: XXX 'splain

const semver = require('semver')

const { isOTelMeterProviderSupported } = require('../../../opentelemetry-metrics')
const shimmer = require('../../shimmer')

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
function isNoopMeterProvider (provider) {
  return !!(provider && provider.constructor && provider.constructor.name === 'NoopMeterProvider')
}

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod
  }

  // Match the @opentelemetry/api versioning rules:
  // https://github.com/open-telemetry/opentelemetry-js/blob/v1.9.1/api/src/internal/semver.ts#L24-L33
  // In short, while the APM agent includes @opentelemetry/api 1.N (and an
  // OTel Metrics SDK compatible with that version) we can support any
  // @opentelemetry/api in the range [1.0, 1.N].
  //
  // Maintenance note: This upper bound should match that from the @opentelemetry/api
  // dep included in the agent.
  if (!semver.satisfies(version, '>=1.0.0 <1.5.0', { includePrerelease: true })) {
    agent.logger.debug('@opentelemetry/api version %s not supported, skipping @opentelemetry/api instrumentation', version)
    return mod
  }

  if (!isOTelMeterProviderSupported) {
    agent.logger.debug('elastic-apm-node OTel Metrics support does not support node %s, skipping @opentelemetry/api instrumentation', process.version)
    return mod
  }

  shimmer.wrap(mod.metrics, 'getMeterProvider', wrapGetMeterProvider)

  return mod

  function wrapGetMeterProvider (orig) {
    return function wrappedGetMeterProvider () {
      const provider = orig.apply(this, arguments)
      if (!isNoopMeterProvider(provider)) {
        // XXX warn about the case where we *have* returned our MeterProvider, but *later*
        //     there is a user-registered meter provider?
        return provider
      }
      const elMeterProvider = agent._getOrCreateOTelMeterProvider()
      return elMeterProvider || provider
    }
  }
}

// function setupOTelMeterProvider (agent) {
//   const metricsInterval = agent._conf.metricsInterval
//   const meterProvider = new MeterProvider()
//   meterProvider.addMetricReader(new PeriodicExportingMetricReader({
//     exporter: new ElasticApmMetricExporter(agent),
//     exportIntervalMillis: metricsInterval * 1000,
//     exportTimeoutMillis: metricsInterval / 2 * 1000
//   }))
//   // XXX nope, need to instr otel.metrics.getMeterProvider and lazily provider ours if a NOOP returns
//   otel.metrics.setGlobalMeterProvider(meterProvider)
// }
