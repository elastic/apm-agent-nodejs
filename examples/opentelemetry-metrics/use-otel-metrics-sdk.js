/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// This is a small example showing how to use the OTel Metrics SDK and API
// together with the Elastic APM agent.
//
// This sets up a simple HTTP server with a histogram metric for response
// latency.
//    while true; do curl http://127.0.0.1:3000/; sleep 1; done
//
// It shows using a `View` to configure the buckets for a histogram metric and
// sets up a Prometheus endpoint:
//    curl -i http://127.0.0.1:3001/metrics
//
// When the Elastic APM agent is started, the histogram metric will also
// periodically be exported to the configured Elastic APM server:
//    export ELASTIC_APM_SERVER_URL='<url of your APM server>'
//    export ELASTIC_APM_SECRET_TOKEN='<secret token for your APM server>'
//    node -r elastic-apm-node/start.js use-otel-metrics-sdk.js

'use strict';

const { createServer } = require('http');
const { performance } = require('perf_hooks');

const otel = require('@opentelemetry/api');
const {
  MeterProvider,
  View,
  ExplicitBucketHistogramAggregation,
} = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter({ host: '127.0.0.1', port: 3001 });
const meterProvider = new MeterProvider({
  views: [
    new View({
      instrumentName: 'latency',
      aggregation: new ExplicitBucketHistogramAggregation(
        // Use the same default buckets as in `prom-client` for comparison.
        // This is to demonstrate using a View. The default buckets used by the
        // APM agent would suffice as well.
        [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      ),
    }),
  ],
});
meterProvider.addMetricReader(exporter);
otel.metrics.setGlobalMeterProvider(meterProvider);
console.log('Prometheus metrics at http://127.0.0.1:3001/metrics');

const meter = otel.metrics.getMeter('my-meter');
const latency = meter.createHistogram('latency', {
  description: 'Response latency (s)',
});

const server = createServer((req, res) => {
  const start = performance.now();
  req.resume();
  req.on('end', () => {
    setTimeout(() => {
      res.end('pong\n');
      latency.record((performance.now() - start) / 1000); // latency in seconds
    }, Math.random() * 80); // random latency up to 80ms
  });
});
server.listen(3000, () => {
  console.log('Listening at http://127.0.0.1:3000/');
});
