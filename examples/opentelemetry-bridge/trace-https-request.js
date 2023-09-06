/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A demonstration of using the Elastic APM OpenTelemetry bridge to
// trace an HTTP request.
//
// Usage:
//    npm install
//    export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true
//    node -r elastic-apm-node/start.js trace-https-request.js

'use strict';

const https = require('https');
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('trace-https-request');

tracer.startActiveSpan('makeRequest', (span) => {
  https.get('https://httpstat.us/200', (response) => {
    console.log('STATUS:', response.statusCode);
    const body = [];
    response.on('data', (chunk) => body.push(chunk));
    response.on('end', () => {
      console.log('BODY:', body.toString());
      span.end();
    });
  });
});
