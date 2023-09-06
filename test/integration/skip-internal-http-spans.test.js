/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const getPort = require('get-port');

const agent = require('../../');

getPort().then((port) => {
  agent.start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false,
    metricsInterval: 0,
    apmServerVersion: '8.0.0',
    centralConfig: false,
  });

  // hack to ensure that all incoming http requests picked up on the mock APM
  // Server doesn't generate any transactions that again will be sent to the
  // same APM Server
  agent.addTransactionFilter((payload) => {
    return false;
  });

  const http = require('http');
  const zlib = require('zlib');
  const ndjson = require('ndjson');
  const test = require('tape');

  test('should not throw on socket close', (t) => {
    const seen = {
      metadata: 0,
      transaction: 0,
      span: 0,
      error: 0,
    };

    const expected = {
      metadata: 1,
      transaction: 0,
      span: 1,
      error: 0,
    };

    const server = http.createServer((req, res) => {
      req
        .pipe(zlib.createGunzip())
        .pipe(ndjson.parse())
        .on('data', (data) => {
          const key = Object.keys(data)[0];
          seen[key] = (seen[key] || 0) + 1;
        })
        .on('end', () => res.end());
    });

    server.listen(port, () => {
      agent.startTransaction('transaction');
      agent.startSpan('span').end();

      // flush agent to generate outgoing http request to the APM Server
      agent.flush(() => {
        // wait for potential span related to the outgoing http request to be processed
        setTimeout(() => {
          for (const key of Object.keys(expected)) {
            t.strictEqual(
              seen[key],
              expected[key],
              `has expected value for ${key}`,
            );
          }

          // flush agent again to see if it created a span for the first flush
          agent.flush(() => {
            // give the APM Server time to receive an process the 2nd flush
            setTimeout(() => {
              for (const key of Object.keys(expected)) {
                t.strictEqual(
                  seen[key],
                  expected[key],
                  `has expected value for ${key}`,
                );
              }

              server.close();
              t.end();
            }, 100);
          });
        }, 100);
      });
    });
  });
});
