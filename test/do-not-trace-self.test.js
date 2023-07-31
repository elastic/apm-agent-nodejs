/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { execFile } = require('child_process');
const tape = require('tape');

const { MockAPMServer } = require('./_mock_apm_server');

// Exec an APM-using script that makes an APM server intake request while
// there is a current transaction. Assert that that current transaction does
// *not* result in tracing of the intake request.
tape.test('APM server intake request should not be traced', function (t) {
  const server = new MockAPMServer();
  server.start(function (serverUrl) {
    execFile(
      process.execPath,
      ['fixtures/do-not-trace-self.js'],
      {
        cwd: __dirname,
        timeout: 10000, // sanity stop, 3s is sometimes too short for CI
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl,
        }),
      },
      function done(err, _stdout, _stderr) {
        t.error(err, 'fixtures/do-not-trace-self.js did not error out');
        t.ok(
          server.events[0].metadata,
          'APM server got an event metadata object',
        );
        t.ok(server.events[1].span, 'APM server got a span event');
        t.equal(server.events.length, 2, 'APM server got no other events');
        t.equal(server.requests.length, 1, 'APM server got a single request');
        const req = server.requests[0];
        t.equal(req.method, 'POST', 'APM server req was a POST...');
        t.ok(req.url.startsWith('/intake'), '... to the intake API');
        t.equal(
          req.headers.traceparent,
          undefined,
          'APM server req had no traceparent header',
        );
        t.equal(
          req.headers.tracestate,
          undefined,
          'APM server req had no tracestate header',
        );
        t.equal(
          req.headers['elastic-apm-traceparent'],
          undefined,
          'APM server req had no elastic-apm-traceparent header',
        );
        server.close();
        t.end();
      },
    );
  });
});
