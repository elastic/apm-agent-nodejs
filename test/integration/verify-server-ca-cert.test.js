/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var getPort = require('get-port');

getPort().then(
  function (port) {
    var fs = require('fs');
    var path = require('path');

    var agent = require('../../').start({
      serviceName: 'test',
      serverUrl: 'https://localhost:' + port,
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: false,
      apmServerVersion: '8.0.0',
      disableInstrumentations: ['https'], // avoid the agent instrumenting the mock APM Server
      serverCaCertFile: path.join(__dirname, 'cert.pem'), // self-signed certificate
    });

    var https = require('https');
    var test = require('tape');

    test('should allow self signed certificate', function (t) {
      t.plan(3);

      var cert = fs.readFileSync(path.join(__dirname, 'cert.pem'));
      var key = fs.readFileSync(path.join(__dirname, 'key.pem'));

      var server = https.createServer({ cert, key }, function (req, res) {
        t.pass('server received client request');
        res.end();
      });

      server.listen(port, function () {
        agent.captureError(new Error('boom!'), function (err) {
          t.error(err);
          t.pass('agent.captureError callback called');
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
