/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');
const utils = require('./lib/utils');

const APMServer = utils.APMServer;

const dataTypes = ['span', 'transaction', 'error'];

dataTypes.forEach(function (dataType) {
  const sendFn = 'send' + dataType.charAt(0).toUpperCase() + dataType.substr(1);

  test(`bufferWindowSize - default value (${dataType})`, function (t) {
    const server = APMServer().client(function (client) {
      // Send one less span than bufferWindowSize
      for (let n = 1; n <= 50; n++) {
        client[sendFn]({ req: n });
        t.ok(client._writableState.corked, 'should be corked');
      }

      // This span should trigger the uncork
      client[sendFn]({ req: 51 });

      // Wait a little to allow the above write to finish before destroying
      process.nextTick(function () {
        t.notOk(client._writableState.corked, 'should be uncorked');

        client.destroy();
        server.close();
        t.end();
      });
    });
  });

  test(`bufferWindowSize - custom value (${dataType})`, function (t) {
    const server = APMServer().client(
      { bufferWindowSize: 5 },
      function (client) {
        // Send one less span than bufferWindowSize
        for (let n = 1; n <= 5; n++) {
          client[sendFn]({ req: n });
          t.ok(client._writableState.corked, 'should be corked');
        }

        // This span should trigger the uncork
        client[sendFn]({ req: 6 });

        // Wait a little to allow the above write to finish before destroying
        process.nextTick(function () {
          t.notOk(client._writableState.corked, 'should be uncorked');

          client.destroy();
          server.close();
          t.end();
        });
      },
    );
  });

  test(`bufferWindowTime - default value (${dataType})`, function (t) {
    const server = APMServer().client(function (client) {
      client[sendFn]({ req: 1 });
      t.ok(client._writableState.corked, 'should be corked');

      // Wait twice as long as bufferWindowTime
      setTimeout(function () {
        t.notOk(client._writableState.corked, 'should be uncorked');
        client.destroy();
        server.close();
        t.end();
      }, 40);
    });
  });

  test(`bufferWindowTime - custom value (${dataType})`, function (t) {
    const server = APMServer().client(
      { bufferWindowTime: 150 },
      function (client) {
        client[sendFn]({ req: 1 });
        t.ok(client._writableState.corked, 'should be corked');

        // Wait twice as long as the default bufferWindowTime
        setTimeout(function () {
          t.ok(client._writableState.corked, 'should be corked');
        }, 40);

        // Wait twice as long as the custom bufferWindowTime
        setTimeout(function () {
          t.notOk(client._writableState.corked, 'should be uncorked');
          client.destroy();
          server.close();
          t.end();
        }, 300);
      },
    );
  });

  test(`write on destroyed (${dataType})`, function (t) {
    const server = APMServer(function (req, res) {
      t.fail('should not send anything to the APM Server');
    }).client(
      { bufferWindowSize: 1, apmServerVersion: '8.0.0' },
      function (client) {
        client.on('error', function (err) {
          t.error(err);
        });

        client[sendFn]({ req: 1 });
        client[sendFn]({ req: 2 });

        // Destroy the client before the _writev function have a chance to be called
        client.destroy();

        setTimeout(function () {
          server.close();
          t.end();
        }, 10);
      },
    );
  });
});
