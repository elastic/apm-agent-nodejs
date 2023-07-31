#!/usr/bin/env node --no-warnings

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// This example shows the Node.js APM agent's instrumentation of the 'undici'
// HTTP client library.
//
// Set `ELASTIC_APM_SERVER_URL` and `ELASTIC_APM_SECRET_TOKEN` environment
// variables to configure the APM agent, then run this script.

const apm = require('../').start({
  serviceName: 'example-trace-undici',
  usePathAsTransactionName: true, // for our simple HTTP server
});

const http = require('http');
const undici = require('undici');

// Start a simple HTTP server that we will call with undici.
const server = http.createServer((req, res) => {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);
  req.resume();
  req.on('end', function () {
    const resBody = JSON.stringify({ ping: 'pong' });
    setTimeout(() => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(resBody),
      });
      res.end(resBody);
    }, 100); // Take ~100ms to respond.
  });
});
server.listen(3000, async () => {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because the undici calls are not
  // in the context of an incoming HTTP request we manually start a transaction.
  // More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const trans = apm.startTransaction('trans', 'manual');

  // Make a handful of requests and use Undici's pipelining
  // (https://undici.nodejs.org/#/?id=pipelining) to show concurrent requests.
  const client = new undici.Client('http://localhost:3000', {
    pipelining: 2,
  });
  let lastReq;
  for (let i = 0; i < 4; i++) {
    lastReq = client.request({ method: 'GET', path: '/ping-' + i });
  }
  const { statusCode, headers, body } = await lastReq;
  console.log('last ping statusCode:', statusCode);
  console.log('last ping headers:', headers);
  for await (const data of body) {
    console.log('last ping data:', data.toString());
  }

  trans.end();
  client.close();
  server.close();
});
