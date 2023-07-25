/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that the run context inside the HTTP server request handler is nulled
// out when the requested path is ignored via "ignoreUrlStr" or the other
// related configuration options.

const { CapturingTransport } = require('../../../_capturing_transport');

const apm = require('../../../..').start({
  serviceName: 'test-http-ignore-url-does-not-leak-trans',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.

  ignoreUrlStr: ['/ignore-this-path'],
  transport() {
    return new CapturingTransport();
  },
});

const { CONTEXT_MANAGER_PATCH } = require('../../../../lib/config/schema');
if (
  Number(process.versions.node.split('.')[0]) <= 8 &&
  apm._conf.contextManager === CONTEXT_MANAGER_PATCH
) {
  // With node v8 and contextManager="patch", i.e. relying on patch-async.js, we
  // do not support this test as written. Given node v8 support *and* arguably
  // patch-async.js support are near EOL, it isn't worth rewriting this test
  // case.
  //
  // Details: The 'only have the span for the http *request*' assert below fails
  // because patch-async.js cannot fully patch node v8's "lib/net.js".
  // Specifically, before https://github.com/nodejs/node/pull/19147 (which was
  // part of node v10), Node would internally use a private `nextTick`:
  //    const { nextTick } = require('internal/process/next_tick');
  // instead of `process.nextTick`. patch-async.js is only able to patch the
  // latter. This means a missed patch of "emitListeningNT" used to emit
  // the server "listening" event, and context loss for `onListen()` below.
  console.log(
    '# SKIP node <=8 and contextManager="patch" loses run context for server.listen callback',
  );
  process.exit();
}

var http = require('http');
var test = require('tape');

test('an ignored incoming http URL does not leak previous transaction', function (t) {
  // Start an outer transaction that should not "leak" into the server handler
  // for ignored URLs.
  var prevTrans = apm.startTransaction('prevTrans');

  var server = http.createServer(function (req, res) {
    t.equal(
      apm.currentTransaction,
      null,
      'current transaction in ignored URL handler is null',
    );
    const span = apm.startSpan('aSpan');
    t.ok(span === null, 'no spans are created in ignored URL handler');
    if (span) {
      span.end();
    }
    res.end();
  });

  server.listen(function onListen() {
    var opts = {
      port: server.address().port,
      path: '/ignore-this-path',
    };
    const req = http.request(opts, function (res) {
      res.on('end', function () {
        server.close();
        prevTrans.end();
        // Wait long enough for the span to encode and be sent to transport.
        setTimeout(function () {
          t.equal(apm._apmClient.transactions.length, 1);
          t.equal(
            apm._apmClient.spans.length,
            1,
            'only have the span for the http *request*',
          );
          t.end();
        }, 200);
      });
      res.resume();
    });
    req.end();
  });
});
