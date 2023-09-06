/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

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

const otel = require('@opentelemetry/api');

const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter({ host: 'localhost' });
const meterProvider = new MeterProvider();
meterProvider.addMetricReader(exporter);
otel.metrics.setGlobalMeterProvider(meterProvider);

const meter = otel.metrics.getMeter('test-meter');

const counter = meter.createCounter('test_counter', {
  description: 'A test Counter',
});

let n = 0;
const asyncCounter = meter.createObservableCounter('test_async_counter', {
  description: 'A test Asynchronous Counter',
});
asyncCounter.addCallback((observableResult) => {
  observableResult.observe(n);
});

const asyncGauge = meter.createObservableGauge('test_async_gauge', {
  description: 'A test Asynchronous Gauge',
});
asyncGauge.addCallback((observableResult) => {
  // A sine wave with a 5 minute period, to have a recognizable pattern.
  observableResult.observe(
    Math.sin((Date.now() / 1000 / 60 / 5) * (2 * Math.PI)),
  );
});

const upDownCounter = meter.createUpDownCounter('test_updowncounter', {
  description: 'A test UpDownCounter',
});

let c = 0;
const asyncUpDownCounter = meter.createObservableUpDownCounter(
  'test_async_updowncounter',
  { description: 'A test Asynchronous UpDownCounter' },
);
asyncUpDownCounter.addCallback((observableResult) => {
  observableResult.observe(c);
});

// We expect this to get the bucket boundaries from the
// `custom_metrics_histogram_boundaries` config.
const histo = meter.createHistogram('test_histogram_confbuckets');

setInterval(() => {
  n++;
  counter.add(1);
  if (new Date().getUTCSeconds() < 30) {
    c++;
    upDownCounter.add(1);
  } else {
    c--;
    upDownCounter.add(-1);
  }
  histo.record(2);
  histo.record(3);
  histo.record(4);
}, 200);
