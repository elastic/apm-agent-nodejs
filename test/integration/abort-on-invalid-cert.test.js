/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const fs = require('fs');
const path = require('path');
var getPort = require('get-port');

const tlsOpts = {
  cert: fs.readFileSync(path.resolve(__dirname, '../fixtures/certs/cert.pem')),
  key: fs.readFileSync(path.resolve(__dirname, '../fixtures/certs/key.pem')),
};

getPort().then(
  function (port) {
    var agent = require('../../').start({
      serviceName: 'test',
      serverUrl: 'https://localhost:' + port,
      metricsInterval: 0,
      centralConfig: false,
    });

    var https = require('https');
    var test = require('tape');

    test('should not allow self signed certificate', function (t) {
      t.plan(1);

      var server = https.createServer(tlsOpts, function (req, res) {
        // Gotcha: there's no way to know if the agent failed except setting
        // `logLevel < error` and looking at stderr, which is a bit cumbersome.
        // This is easier.
        t.fail('should not reach this point');
      });

      server.listen(port, function () {
        agent.captureError(new Error('boom!'), function () {
          server.close();
          t.pass('agent.captureError callback called');
        });
      });
    });
  },
  function (err) {
    throw err;
  },
);
