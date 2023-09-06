/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test "run context" handling for HTTP instrumentation.
//
// Thes tests below execute a script from "fixtures/" and assert that the (mock)
// APM server got the expected trace (parent/child relationships, span.sync
// property, etc.).
//
// The scripts also tend to `assert(...)` that the current transaction and span
// are as expected at different points in code. These asserts can also be
// illustrative when learning or debugging run context handling in the agent.
// The scripts can be run independent of the test suite.

const { execFile } = require('child_process');
const path = require('path');
const tape = require('tape');

const { MockAPMServer } = require('../../../_mock_apm_server');

const cases = [
  {
    // Expect:
    //   transaction "t0"
    //   `- span "GET www.google.com"
    //   `- span "span-sync-after-http.request"
    //   `- span "span-in-clientReq-on-socket"
    //   `- span "span-in-clientReq-on-finish"
    //   `- span "span-in-http.request-callback"
    //   `- span "span-in-clientReq-on-response"
    //   `- span "span-in-clientRes-on-data"
    //   `- span "span-in-clientRes-on-end"
    //
    // The main point of this test is that we expect that all user code around
    // using an `http.request` is *not* in the context of the automatic span
    // for the HTTP request itself. If that were the case, then other created
    // spans (automatic or manual) would be *child* spans, which is problematic
    // for exit-span handling, compressed spans, breakdown metrics, etc.
    script: 'make-http-request.js',
    check: (t, events) => {
      t.equal(events.length, 10, 'exactly 10 events');
      const metadata = events.shift();
      t.ok(metadata, 'APM server got event metadata object');
      events.sort((a, b) => {
        return (a.span || a.transaction).timestamp <
          (b.span || b.transaction).timestamp
          ? -1
          : 1;
      });
      const trans = events.shift().transaction;
      t.equal(trans.name, 't0', 'transaction.name');
      events.forEach((e) => {
        t.equal(
          e.span.parent_id,
          trans.id,
          `span ${e.span.name} is a child of the transaction`,
        );
      });
      const spanGet = events.shift().span;
      t.equal(spanGet.name, 'GET www.google.com');
    },
  },
  {
    // Same as above, but s/http/https/, to verify "https" instrumentation
    // works as well.
    script: 'make-https-request.js',
    check: (t, events) => {
      t.equal(events.length, 10, 'exactly 10 events');
      const metadata = events.shift();
      t.ok(metadata, 'APM server got event metadata object');
      events.sort((a, b) => {
        return (a.span || a.transaction).timestamp <
          (b.span || b.transaction).timestamp
          ? -1
          : 1;
      });
      const trans = events.shift().transaction;
      t.equal(trans.name, 't0', 'transaction.name');
      events.forEach((e) => {
        t.equal(
          e.span.parent_id,
          trans.id,
          `span ${e.span.name} is a child of the transaction`,
        );
      });
      const spanGet = events.shift().span;
      t.equal(
        spanGet.name,
        'GET www.google.com',
        'first span.name is "GET www.google.com"',
      );
    },
  },
];

cases.forEach((c) => {
  tape.test(`http/fixtures/${c.script}`, c.testOpts || {}, (t) => {
    const server = new MockAPMServer();
    const scriptPath = path.join('fixtures', c.script);
    server.start(function (serverUrl) {
      execFile(
        process.execPath,
        [scriptPath],
        {
          cwd: __dirname,
          timeout: 10000, // guard on hang, 3s is sometimes too short for CI
          env: Object.assign({}, process.env, {
            ELASTIC_APM_SERVER_URL: serverUrl,
          }),
        },
        function done(err, stdout, stderr) {
          t.error(err, `${scriptPath} exited non-zero`);
          if (err) {
            t.comment(`${scriptPath} stdout:\n${stdout}\n`);
            t.comment(`${scriptPath} stderr:\n${stderr}\n`);
            t.comment('skip checks because script errored out');
          } else {
            c.check(t, server.events);
          }
          server.close();
          t.end();
        },
      );
    });
  });
});
