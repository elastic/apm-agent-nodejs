/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// A small example showing using the OTel NodeSDK to setup metrics.
// If used with the Elastic APM agent via:
//      node --require elastic-apm-node/start use-otel-node-sdk.js
// then metrics will be periodically exported to the configured Elastic APM
// intake without interfering.

const process = require('process')
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const otel = require('@opentelemetry/api')

const sdk = new NodeSDK({
  serviceName: 'use-otel-node-sdk',
  metricReader: new PrometheusExporter()
});
sdk.start()

const meter = otel.metrics.getMeter('my-meter')
const counter = meter.createCounter('my_counter', { description: 'My Counter' })
setInterval(() => {
  counter.add(1)
}, 1000)
console.log('Started (pid %s)', process.pid)

const onProcEnd = () => {
  sdk
    .shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (err) => console.log('Error shutting down SDK', err)
    )
    .finally(() => process.exit(0))
}
process.on('SIGTERM', onProcEnd)
process.on('SIGINT', onProcEnd)
