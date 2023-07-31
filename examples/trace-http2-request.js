#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing outgoing HTTP/2 requests
// (i.e. `http2.request`).

const apm = require('../').start({
  serviceName: 'example-trace-http2-request',
});

const http2 = require('http2');
const { HTTP2_HEADER_PATH } = http2.constants;

const session = http2.connect('https://httpstat.us');

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t0 = apm.startTransaction('t0');

const req = session.request({
  [HTTP2_HEADER_PATH]: '/200',
  accept: '*/*',
});
req.on('response', (headers) => {
  console.log('client response:', headers);
});
req.setEncoding('utf8');
req.on('data', (chunk) => {
  console.log('data chunk:', chunk);
});
req.on('end', () => {
  console.log('req end');
  t0.end();
  session.close();
});
