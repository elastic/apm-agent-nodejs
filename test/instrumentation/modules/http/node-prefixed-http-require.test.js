/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that instrumentation of core modules works when required with the
// 'node:' prefix.

const { CapturingTransport } = require('../../../_capturing_transport');

const apm = require('../../../..').start({
  serviceName: 'test-node-prefixed-http-require',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  transport() {
    return new CapturingTransport();
  },
});

try {
  var http = require('node:http');
} catch (_requireErr) {
  console.log(
    `# SKIP node ${process.version} doesn't support require('node:...')`,
  );
  process.exit();
}

const test = require('tape');
const { findObjInArray } = require('../../../_utils');

test('node:http instrumentation works', function (t) {
  var server = http.createServer(function (req, res) {
    res.end('pong');
  });

  server.listen(function onListen() {
    const aTrans = apm.startTransaction('aTrans', 'manual');
    const port = server.address().port;
    const url = 'http://localhost:' + port;
    http.get(url, function (res) {
      res.resume();
      res.on('end', function () {
        aTrans.end();
        server.close();
        apm.flush(() => {
          const aTrans_ = findObjInArray(
            apm._apmClient.transactions,
            'name',
            'aTrans',
          );
          const httpClientSpan = findObjInArray(
            apm._apmClient.spans,
            'name',
            `GET localhost:${port}`,
          );
          const httpServerTrans = findObjInArray(
            apm._apmClient.transactions,
            'type',
            'request',
          );
          t.ok(
            aTrans_ && httpClientSpan && httpServerTrans,
            'received the expected trace objs',
          );
          t.equal(
            httpClientSpan.parent_id,
            aTrans_.id,
            'http client span is a child of the manual trans',
          );
          t.equal(
            httpServerTrans.parent_id,
            httpClientSpan.id,
            'http server trans is a child of the http client span',
          );
          t.end();
        });
      });
    });
  });
});
