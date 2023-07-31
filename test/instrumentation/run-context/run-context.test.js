/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test "run context" tracking by the APM agent. Run context is what determines
// the `currentTransaction` and `currentSpan` during execution of JS code, and
// hence the parent/child relationship of spans.
//
// Most of the tests below execute a script from "fixtures/" and assert that
// the (mock) APM server got the expected trace (parent/child relationships,
// span.sync property, etc.).
//
// The scripts also tend to `assert(...)` that the current transaction and span
// are as expected at different points in code. These asserts can also be
// illustrative when learning or debugging run context handling in the agent.
// The scripts can be run independent of the test suite.

const { execFile } = require('child_process');
const path = require('path');
const tape = require('tape');

const { MockAPMServer } = require('../../_mock_apm_server');
const { findObjInArray } = require('../../_utils');

const cases = [
  {
    // Expect:
    //   transaction "t1"
    //   `- span "s2"
    //   transaction "t4"
    //   `- span "s5"
    script: 'simple.js',
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 5, 'exactly 5 events');
      const t1 = findObjInArray(events, 'transaction.name', 't1').transaction;
      const s2 = findObjInArray(events, 'span.name', 's2').span;
      t.equal(s2.parent_id, t1.id, 's2 is a child of t1');
      t.equal(s2.sync, false, 's2.sync=false');
      const t4 = findObjInArray(events, 'transaction.name', 't4').transaction;
      const s5 = findObjInArray(events, 'span.name', 's5').span;
      t.equal(s5.parent_id, t4.id, 's5 is a child of t4');
      t.equal(s5.sync, true, 's5.sync=true');
    },
  },
  {
    // Expect:
    //   transaction "t1"
    //   transaction "t2"
    //   transaction "t3"
    //   `- span "s4"
    //     `- span "s5"
    script: 'custom-instrumentation-sync.js',
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 6, 'exactly 6 events');
      const t3 = findObjInArray(events, 'transaction.name', 't3').transaction;
      const s4 = findObjInArray(events, 'span.name', 's4').span;
      const s5 = findObjInArray(events, 'span.name', 's5').span;
      t.equal(s4.parent_id, t3.id, 's4 is a child of t3');
      t.equal(s4.sync, true, 's4.sync=true');
      t.equal(s5.parent_id, s4.id, 's5 is a child of s4');
      t.equal(s5.sync, true, 's5.sync=true');
    },
  },
  {
    script: 'ls-callbacks.js',
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 4, 'exactly 4 events');
      const t1 = findObjInArray(events, 'transaction.name', 'ls').transaction;
      const s2 = findObjInArray(events, 'span.name', 'cwd').span;
      const s3 = findObjInArray(events, 'span.name', 'readdir').span;
      t.equal(s2.parent_id, t1.id, 's2 is a child of t1');
      t.equal(s2.sync, true, 's2.sync=true');
      t.equal(s3.parent_id, t1.id, 's3 is a child of t1');
      t.equal(s3.sync, false, 's3.sync=false');
    },
  },
  {
    script: 'ls-promises.js',
    testOpts: {
      skip: !require('fs').promises,
    },
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 4, 'exactly 4 events');
      const t1 = findObjInArray(events, 'transaction.name', 'ls').transaction;
      const s2 = findObjInArray(events, 'span.name', 'cwd').span;
      const s3 = findObjInArray(events, 'span.name', 'readdir').span;
      t.equal(s2.parent_id, t1.id, 's2 is a child of t1');
      t.equal(s3 && s3.parent_id, t1.id, 's3 is a child of t1');
    },
  },
  {
    script: 'ls-await.js',
    testOpts: {
      skip: !require('fs').promises,
    },
    check: (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 4, 'exactly 4 events');
      const t1 = findObjInArray(events, 'transaction.name', 'ls').transaction;
      const s2 = findObjInArray(events, 'span.name', 'cwd').span;
      const s3 = findObjInArray(events, 'span.name', 'readdir').span;
      t.equal(s2.parent_id, t1.id, 's2 is a child of t1');
      t.equal(s3.parent_id, t1.id, 's3 is a child of t1');
    },
  },
  {
    script: 'parentage-with-ended-span.js',
    check: (t, events) => {
      // Expected:
      //  - transaction "t0"
      //    - span "s1"
      //      - span "s3"
      //    - span "s2"
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 5, 'exactly 5 events');
      const t0 = findObjInArray(events, 'transaction.name', 't0').transaction;
      const s1 = findObjInArray(events, 'span.name', 's1').span;
      const s2 = findObjInArray(events, 'span.name', 's2').span;
      const s3 = findObjInArray(events, 'span.name', 's3').span;
      t.equal(s1.parent_id, t0.id, 's1 is a child of t0');
      t.equal(s1.sync, false, 's1.sync=false');
      t.equal(
        s2.parent_id,
        t0.id,
        's2 is a child of t0 (because s1 ended before s2 was started, in the same async task)',
      );
      t.equal(s2.sync, false, 's2.sync=false');
      t.equal(s3.parent_id, s1.id, 's3 is a child of s1');
      t.equal(s3.sync, false, 's3.sync=false');
    },
  },
  {
    script: 'end-non-current-spans.js',
    check: (t, events) => {
      // Expected:
      //   transaction "t0"
      //   `- span "s1"
      //     `- span "s2"
      //     `- span "s3"
      //       `- span "s4"
      t.ok(events[0].metadata, 'APM server got event metadata object');
      t.equal(events.length, 6, 'exactly 6 events');
      const t0 = findObjInArray(events, 'transaction.name', 't0').transaction;
      const s1 = findObjInArray(events, 'span.name', 's1').span;
      const s2 = findObjInArray(events, 'span.name', 's2').span;
      const s3 = findObjInArray(events, 'span.name', 's3').span;
      const s4 = findObjInArray(events, 'span.name', 's4').span;
      t.equal(s1.parent_id, t0.id, 's1 is a child of t0');
      t.equal(s2.parent_id, s1.id, 's2 is a child of s1');
      t.equal(s3.parent_id, s1.id, 's3 is a child of s1');
      t.equal(s4.parent_id, s3.id, 's4 is a child of s3');
    },
  },
];

cases.forEach((c) => {
  tape.test(`run-context/fixtures/${c.script}`, c.testOpts || {}, (t) => {
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
        function done(err, _stdout, _stderr) {
          t.error(err, `${scriptPath} exited non-zero`);
          if (err) {
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
