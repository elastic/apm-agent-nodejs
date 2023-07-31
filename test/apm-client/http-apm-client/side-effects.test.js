/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const path = require('path');
const exec = require('child_process').exec;
const test = require('tape');
const utils = require('./lib/utils');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;
const assertIntakeReq = utils.assertIntakeReq;
const assertMetadata = utils.assertMetadata;
const assertEvent = utils.assertEvent;

// Exec a script that uses `client.sendSpan(...)` and then finishes. The
// script process should finish quickly. This is exercising the "beforeExit"
// (to end an ongoing intake request) and Client.prototype._unref (to hold the
// process to complete sending to APM server) handling in the client.
test('client should not hold the process open', function (t) {
  t.plan(
    1 + assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
  );

  const thingsToAssert = [
    assertMetadata,
    assertEvent({ span: { hello: 'world' } }),
  ];

  const server = APMServer(function (req, res) {
    // Handle the server info endpoint.
    if (req.method === 'GET' && req.url === '/') {
      req.resume();
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          build_date: '...',
          build_sha: '...',
          version: '8.0.0',
        }),
      );
      return;
    }

    // Handle an intake request.
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      thingsToAssert.shift()(t, obj);
    });
    req.on('end', function () {
      res.statusCode = 202;
      res.end();
      server.close();
    });
  });

  server.listen(function () {
    const url = 'http://localhost:' + server.address().port;
    const file = path.join(__dirname, 'lib', 'unref-client.js');
    exec(`node ${file} ${url}`, function (err, stdout, stderr) {
      if (stderr.trim()) {
        t.comment('stderr from unref-client.js:\n' + stderr);
      }
      if (err) {
        throw err;
      }
      const end = Date.now();
      const start = Number(stdout);
      const duration = end - start;
      t.ok(
        duration < 300,
        `should not take more than 300ms to complete (was: ${duration}ms)`,
      );
      t.end();
    });
  });
});

// This is the same test as the previous, except this time the APM server is
// not responding. Normally the `intakeResTimeout` value is used to handle
// timing out intake requests. However, that timeout defaults to 10s, which is
// very long to hold a closing process open. `makeIntakeRequest` overrides
// `intakeResTimeout` to *1s* if the client is ending. We test that ~1s timeout
// here.
test('client should not hold the process open even if APM server not responding', function (t) {
  t.plan(
    2 + assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
  );

  const thingsToAssert = [
    assertMetadata,
    assertEvent({ span: { hello: 'world' } }),
  ];

  const server = APMServer(function (req, res) {
    // Handle the server info endpoint.
    if (req.method === 'GET' && req.url === '/') {
      req.resume();
      // Intentionally do not respond.
      return;
    }

    // Handle an intake request.
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      thingsToAssert.shift()(t, obj);
    });
    req.on('end', function () {
      res.statusCode = 202;
      // Here the server is intentionally not responding:
      // res.end()
      // server.close()
    });
  });

  server.listen(function () {
    const url = 'http://localhost:' + server.address().port;
    const file = path.join(__dirname, 'lib', 'unref-client.js');
    exec(`node ${file} ${url}`, function (err, stdout, stderr) {
      if (stderr.trim()) {
        t.comment('stderr from unref-client.js:\n' + stderr);
      }
      t.ifErr(err, `no error from executing ${file}`);
      const end = Date.now();
      const start = Number(stdout);
      const duration = end - start;
      t.ok(
        duration > 700 && duration < 1300,
        `should take approximately 1000ms to timeout (was: ${duration}ms)`,
      );

      server.close();
      t.end();
    });
  });
});
