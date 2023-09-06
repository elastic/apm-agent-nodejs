/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var getPort = require('get-port');

getPort().then(
  function (port) {
    var agent = require('../../').start({
      serviceName: 'test',
      serverUrl: 'http://localhost:' + port,
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: false,
      disableInstrumentations: ['http'], // avoid the agent instrumenting the mock APM Server
    });

    var http = require('http');
    var test = require('tape');

    test('should not throw on 503', function (t) {
      var server = http.createServer(function (req, res) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end('{"error":"something"}');
      });

      server.listen(port, function () {
        agent.captureError(new Error('foo'), function (err) {
          t.error(err);
          t.end();
          server.close();
          agent.destroy();
        });
      });
    });
  },
  function (err) {
    throw err;
  },
);
