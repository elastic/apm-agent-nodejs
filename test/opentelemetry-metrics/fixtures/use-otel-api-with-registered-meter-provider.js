/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Run without the APM agent this script will export metrics via a Prometheus
// endpoint:
//      curl -i http://localhost:9464/metrics
//
// With the APM agent running we also expect periodic metricsets sent to APM
// server, because the agent will add its MetricReader to the created
// MeterProvider.
//
// This test case checks that the APM agent does *not* interfere with the
// `.setGlobalMeterProvider()` usage.

const otel = require('@opentelemetry/api')

const { MeterProvider } = require('@opentelemetry/sdk-metrics')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')

const exporter = new PrometheusExporter({ host: 'localhost' })
const meterProvider = new MeterProvider()
meterProvider.addMetricReader(exporter)
otel.metrics.setGlobalMeterProvider(meterProvider)

const meter = otel.metrics.getMeter('my-meter')
const counter = meter.createCounter('test_counter', { description: 'A test Counter' })
setInterval(() => {
  counter.add(1)
}, 200)
