#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing outgoing HTTP requests using
// `http.request` (or `http.get`, `https.request`, `https.get`) from Node.js
// core.

const apm = require('../').start({
  serviceName: 'example-trace-http-request',
  // Now that OpenTelemetry has been GA for a while, the Elastic-specific
  // 'elastic-apm-traceparent' header is rarely needed.
  useElasticTraceparentHeader: false,
});

const http = require('http');

function makeARequest(url, opts, cb) {
  const clientReq = http.request(url, opts, function (clientRes) {
    console.log(
      'client response: %s %s',
      clientRes.statusCode,
      clientRes.headers,
    );

    const chunks = [];
    clientRes.on('data', function (chunk) {
      chunks.push(chunk);
    });

    clientRes.on('end', function () {
      const body = chunks.join('');
      console.log('client response body: %j', body);
      cb();
    });
  });

  clientReq.end();
}

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t0 = apm.startTransaction('t0');
makeARequest(
  'http://httpstat.us/200',
  { headers: { accept: '*/*' } },
  function () {
    t0.end();
  },
);
