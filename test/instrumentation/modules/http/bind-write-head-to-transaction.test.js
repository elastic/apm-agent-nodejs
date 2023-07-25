/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-outgoing',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
});

var http = require('http');

var test = require('tape');

var mockClient = require('../../../_mock_http_client');

test('response writeHead is bound to transaction', function (t) {
  resetAgent((data) => {
    t.strictEqual(data.transactions.length, 1, 'has a transaction');

    var trans = data.transactions[0];
    t.strictEqual(trans.result, 'HTTP 2xx', 'has correct result');

    t.end();
  });

  var server = http.createServer(function (req, res) {
    agent._instrumentation.supersedeWithEmptyRunContext();
    res.end();
  });

  server.listen(function () {
    var port = server.address().port;
    http.get(`http://localhost:${port}`, function (res) {
      res.resume();
      res.on('end', () => {
        server.close();
      });
    });
  });
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
