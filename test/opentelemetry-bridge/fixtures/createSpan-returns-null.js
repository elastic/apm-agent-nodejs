/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// This tests the OTel Bridge for the case when `tracer.startSpan()` calls
// the internal API `transaction.createSpan()` **and that returns null**.
// Currently that can happen when attempting to create a child of an exit
// span (a contrived case).
//
// The OTel Bridge needs to:
// - return a non-recording span, because it needs to return something that
//   implements interface Span; and
// - propagate W3C trace-context for possible subsequent outgoing HTTP requests
//
// Usage:
//    ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true \
//      node -r ../../../start.js createSpan-returns-null.js
//
// Expected trace:
//    trace $traceId
//    `- transaction "aTrans"
//       `- span "anExitSpan"
//         `- transaction "GET unknown route"

const apm = require('../../..');
const assert = require('assert');
const http = require('http');
const otel = require('@opentelemetry/api');

const tracer = otel.trace.getTracer('test-createSpan-returns-null');

const server = http.createServer(function onRequest(req, res) {
  console.log('server request: %s %s %s', req.method, req.url, req.headers);
  req.resume();
  req.on('end', function () {
    const resBody = JSON.stringify({ ping: 'pong' });
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(resBody),
    });
    res.end(resBody);
  });
});

async function makeAClientRequest(port) {
  return new Promise((resolve) => {
    http.get(
      {
        host: 'localhost',
        port,
        path: '/ping',
      },
      (cRes) => {
        console.log('client response status:', cRes.statusCode);
        console.log('client response headers:', cRes.headers);
        const body = [];
        cRes.on('data', (chunk) => body.push(chunk));
        cRes.on('end', () => {
          console.log('client response body:', body.toString());
          resolve();
        });
      },
    );
  });
}

server.listen(async () => {
  const port = server.address().port;

  // 1. Create an APM transaction.
  tracer.startActiveSpan('aTrans', async (aTrans) => {
    // 2. Use the Elastic API to create an *exit* span.
    const anExitSpan = apm.startSpan('anExitSpan', 'myType', 'mySubtype', {
      exitSpan: true,
    });
    // 3. Attempt to create a child span of that exit span. This triggers the
    //    code path where `Transaction#createSpan()` returns null.
    await tracer.startActiveSpan('theSpan', async (theSpan) => {
      assert.strictEqual(
        theSpan.isRecording(),
        false,
        'theSpan is not recording',
      );
      assert.strictEqual(
        theSpan.spanContext().spanId,
        anExitSpan.id,
        'theSpan is carrying the trace-context of its parent (anExitSpan)',
      );
      await makeAClientRequest(port);
      theSpan.end();
    });
    anExitSpan.end();
    aTrans.end();
    server.close();
  });
});
