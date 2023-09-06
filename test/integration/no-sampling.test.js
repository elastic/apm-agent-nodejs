/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var getPort = require('get-port');
var ndjson = require('ndjson');

getPort().then(
  function (port) {
    var agent = require('../../').start({
      serviceName: 'test-no-sampling',
      serverUrl: 'http://localhost:' + port,
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: false,
      apmServerVersion: '8.0.0',
      disableInstrumentations: ['http'], // avoid the agent instrumenting the mock APM Server
      apiRequestTime: '1s',
    });

    var http = require('http');
    var zlib = require('zlib');
    var test = require('tape');

    test('should not sample', function (t) {
      var server = http.createServer(function (req, res) {
        req = req.pipe(zlib.createGunzip()).pipe(ndjson.parse());

        const received = {
          metadata: 0,
          transaction: 0,
        };
        req.on('data', function (obj) {
          const type = Object.keys(obj)[0];
          received[type]++;
        });
        req.on('end', function () {
          t.strictEqual(received.metadata, 1, 'expected 1 metadata to be sent');
          t.strictEqual(
            received.transaction,
            20,
            'expected 20 transactions to be sent',
          );
          res.end();
          t.end();
          server.close();
          agent.destroy();
        });
      });

      server.listen(port, makeManyTransactions);
    });

    function makeManyTransactions(n) {
      n = n || 0;
      if (++n > 20) return;
      makeTransaction(makeManyTransactions.bind(null, n));
    }

    function makeTransaction(cb) {
      var trans = agent.startTransaction('foo', 'bar');
      setTimeout(function () {
        trans.end();
        process.nextTick(cb);
      }, 10);
    }
  },
  function (err) {
    throw err;
  },
);
