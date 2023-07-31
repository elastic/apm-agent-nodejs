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
      apmServerVersion: '8.0.0',
      disableInstrumentations: ['http'], // avoid the agent instrumenting the mock APM Server
    });

    var net = require('net');
    var test = require('tape');

    test('should not throw on socket close', function (t) {
      var server = net.createServer(function (socket) {
        socket.destroy();
      });

      server.listen(port, function () {
        agent.captureError(new Error('foo'), function (err) {
          t.error(err);
          t.end();
          server.close();
        });
      });
    });
  },
  function (err) {
    throw err;
  },
);
