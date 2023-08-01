/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

delete process.env.ELASTIC_APM_CENTRAL_CONFIG; // In case this is set, don't let it break the test.

const http = require('http');

const test = require('tape');

test('central config disabled', function (t) {
  const server = http.createServer((req, res) => {
    t.notOk(
      req.url.startsWith('/config/v1/agents'),
      `should not poll APM Server for config (url: ${req.url})`,
    );
    req.resume();
    res.end();
  });

  server.listen(function () {
    const agent = require('..').start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      apmServerVersion: '8.0.0',
      centralConfig: false,
    });

    setTimeout(function () {
      t.pass('should not poll APM Server for config');
      agent.destroy();
      server.close();
      t.end();
    }, 1000);
  });
});
