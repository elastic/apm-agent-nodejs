/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Expect:
//    transaction "callServiceA"
//    `- span "GET localhost:$portA" (context.http.url=http://localhost:$portA/a-ping)
//      `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
//         `- span "GET localhost:$portB" (context.http.url=http://localhost:$portB/b-ping)
//           `- transaction "GET unknown route" (context.request.headers.{traceparent,tracestate})
//
// This scripts starts two HTTP servers, `serviceA` and `serviceB`, then makes
// an HTTP client "GET /a-ping" to serviceA. Service A will always call service
// B before responding.
//
// This tests that the automatic instrumentation for distributed traces is working.

// const assert = require('assert')
const http = require('http');

const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('play');

const serviceA = http.createServer(function onARequest(req, res) {
  console.log('serviceA request: %s %s %s', req.method, req.url, req.headers);
  req.resume();
  req.on('end', function () {
    // Make a client request to service B...
    http.get(
      {
        host: 'localhost',
        port: serviceB.address().port,
        path: '/b-ping',
      },
      (cRes) => {
        console.log('serviceB response status:', cRes.statusCode);
        console.log('serviceB response headers:', cRes.headers);
        const body = [];
        cRes.on('data', (chunk) => body.push(chunk));
        cRes.on('end', () => {
          console.log('serviceB response body:', body.toString());

          // ... then respond.
          const resBody = JSON.stringify({ ping: 'pong', server: 'A' });
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(resBody),
          });
          res.end(resBody);
        });
      },
    );
  });
});

const serviceB = http.createServer(function onBRequest(req, res) {
  console.log('serviceB request: %s %s %s', req.method, req.url, req.headers);
  req.resume();
  req.on('end', function () {
    const resBody = JSON.stringify({ ping: 'pong', server: 'B' });
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(resBody),
    });
    res.end(resBody);
  });
});

// 1. Start the HTTP services.
serviceA.listen(() => {
  serviceB.listen(() => {
    // 2. Call service A.
    const span = tracer.startSpan('callServiceA');
    otel.context.with(otel.trace.setSpan(otel.context.active(), span), () => {
      http.get(
        {
          host: 'localhost',
          port: serviceA.address().port,
          path: '/a-ping',
        },
        (res) => {
          console.log('serviceA response status:', res.statusCode);
          console.log('serviceA response headers:', res.headers);
          const body = [];
          res.on('data', (chunk) => body.push(chunk));
          res.on('end', () => {
            console.log('serviceA response body:', body.toString());
            span.end();

            // 3. Shutdown.
            serviceB.close();
            serviceA.close();
          });
        },
      );
    });
  });
});
