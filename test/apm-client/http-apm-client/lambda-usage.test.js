/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the expected usage of this Client in an AWS Lambda environment.
// The "Notes on Lambda usage" section in the README.md describes the
// expected usage.
//
// Note: This test file needs to be run in its own process.

// Must set this before the Client is imported so it thinks it is in a Lambda env.
process.env.AWS_LAMBDA_FUNCTION_NAME = 'myFn';

const { URL } = require('url');
const zlib = require('zlib');
const test = require('tape');
const { APMServer } = require('./lib/utils');

test('lambda usage', (suite) => {
  let server;
  let client;
  let reqsToServer = [];
  let lateSpanInSameTickCallbackCalled = false;
  let lateSpanInNextTickCallbackCalled = false;

  test('setup mock APM server', (t) => {
    server = APMServer(function (req, res) {
      if (req.method === 'POST' && req.url === '/register/transaction') {
        req.resume();
        req.on('end', () => {
          res.writeHead(200);
          res.end();
        });
        return;
      } else if (
        !(req.method === 'POST' && req.url.startsWith('/intake/v2/events'))
      ) {
        req.resume();
        req.on('end', () => {
          res.writeHead(404);
          res.end();
        });
        return;
      }

      // Capture intake req data to this mock APM server to `reqsToServer`.
      const reqInfo = {
        method: req.method,
        path: req.url,
        url: new URL(req.url, 'http://localhost'),
        headers: req.headers,
        events: [],
      };
      let instream = req;
      if (req.headers['content-encoding'] === 'gzip') {
        instream = req.pipe(zlib.createGunzip());
      } else {
        instream.setEncoding('utf8');
      }
      let body = '';
      instream.on('data', (chunk) => {
        body += chunk;
      });
      instream.on('end', () => {
        body
          .split(/\n/g) // parse each line
          .filter((line) => line.trim()) // ... if it is non-empty
          .forEach((line) => {
            reqInfo.events.push(JSON.parse(line)); // ... append to reqInfo.events
          });
        reqsToServer.push(reqInfo);
        res.writeHead(202); // the expected response from intake API endpoint
        res.end('{}');
      });
    });

    server.client(
      {
        apmServerVersion: '8.0.0',
        centralConfig: false,
      },
      function (client_) {
        client = client_;
        t.end();
      },
    );
  });

  test('clients stays corked before .lambdaStart()', (t) => {
    t.plan(2);
    // Add more events than `bufferWindowSize` and wait for more than
    // `bufferWindowTime`, and the Client should *still* be corked.
    const aTrans = {
      name: 'aTrans',
      type: 'custom',
      result: 'success' /* ... */,
    };
    for (let i = 0; i < client._conf.bufferWindowSize + 1; i++) {
      client.sendTransaction(aTrans);
    }
    setTimeout(() => {
      t.equal(
        client._writableState.corked,
        1,
        'corked after bufferWindowSize events and bufferWindowTime',
      );
      t.equal(
        reqsToServer.length,
        0,
        'no intake request was made to APM Server',
      );
      // t.end()
    }, client._conf.bufferWindowTime + 10);
  });

  test('lambda invocation', async (t) => {
    client.lambdaStart(); // 1. start of invocation

    // 2. Registering transaction
    t.equal(
      client.lambdaShouldRegisterTransactions(),
      true,
      '.lambdaShouldRegisterTransactions() is true',
    );
    await client.lambdaRegisterTransaction(
      {
        name: 'GET /aStage/myFn',
        type: 'lambda',
        outcome: 'unknown' /* ... */,
      },
      '063de0d2-1705-4eeb-9dfd-045d76b8cdec',
    );
    t.equal(
      client.lambdaShouldRegisterTransactions(),
      true,
      '.lambdaShouldRegisterTransactions() is true after register',
    );

    return new Promise(function (resolve) {
      setTimeout(() => {
        client.sendTransaction({
          name: 'GET /aStage/myFn',
          type: 'lambda',
          result: 'success' /* ... */,
        });
        client.sendSpan({
          name: 'mySpan',
          type: 'custom',
          result: 'success' /* ... */,
        });

        // 3. Flush at end of invocation
        client.flush({ lambdaEnd: true }, function () {
          t.ok(
            reqsToServer.length > 1,
            'at least 2 intake requests to APM Server',
          );
          t.equal(
            reqsToServer[reqsToServer.length - 1].url.searchParams.get(
              'flushed',
            ),
            'true',
            'the last intake request had "?flushed=true" query param',
          );

          let allEvents = [];
          reqsToServer.forEach((r) => {
            allEvents = allEvents.concat(r.events);
          });
          t.equal(
            allEvents[allEvents.length - 2].transaction.name,
            'GET /aStage/myFn',
            'second last event is the lambda transaction',
          );
          t.equal(
            allEvents[allEvents.length - 1].span.name,
            'mySpan',
            'last event is the lambda span',
          );

          reqsToServer = []; // reset
          t.end();
          resolve();
        });

        // Explicitly send late events and flush *after* the
        // `client.flush({lambdaEnd:true})` -- both in the same tick and next
        // ticks -- to test that these get buffered until the next lambda
        // invocation.
        client.sendSpan({
          name: 'lateSpanInSameTick',
          type: 'custom' /* ... */,
        });
        client.flush(function () {
          lateSpanInSameTickCallbackCalled = true;
        });
        setImmediate(() => {
          client.sendSpan({
            name: 'lateSpanInNextTick',
            type: 'custom' /* ... */,
          });
          client.flush(function () {
            lateSpanInNextTickCallbackCalled = true;
          });
        });
      }, 10);
    });
  });

  // Give some time to make sure there isn't some unexpected short async
  // interaction.
  test('pause between lambda invocations', (t) => {
    setTimeout(() => {
      t.end();
    }, 1000);
  });

  test('second lambda invocation', (t) => {
    t.equal(
      lateSpanInSameTickCallbackCalled,
      false,
      'lateSpanInSameTick flush callback not yet called',
    );
    t.equal(
      lateSpanInNextTickCallbackCalled,
      false,
      'lateSpanInNextTick flush callback not yet called',
    );
    t.equal(
      reqsToServer.length,
      0,
      'no intake request was made to APM Server since last lambdaEnd',
    );

    client.lambdaStart();
    setTimeout(() => {
      client.flush({ lambdaEnd: true }, () => {
        t.equal(reqsToServer.length, 3, '3 intake requests to APM Server');
        t.equal(
          lateSpanInSameTickCallbackCalled,
          true,
          'lateSpanInSameTick flush callback has now been called',
        );
        t.equal(
          lateSpanInNextTickCallbackCalled,
          true,
          'lateSpanInNextTick flush callback has now been called',
        );

        t.equal(
          reqsToServer[0].events.length,
          2,
          'the first intake request has 2 events',
        );
        t.equal(
          reqsToServer[0].events[1].span.name,
          'lateSpanInSameTick',
          'of which the second event is the lateSpanInSameTick',
        );
        t.equal(
          reqsToServer[1].events.length,
          2,
          'the second intake request has 2 events',
        );
        t.equal(
          reqsToServer[1].events[1].span.name,
          'lateSpanInNextTick',
          'of which the second event is the lateSpanInNextTick',
        );
        t.equal(
          reqsToServer[reqsToServer.length - 1].url.searchParams.get('flushed'),
          'true',
          'the last intake request had "?flushed=true" query param',
        );
        t.end();
      });
    }, 10);
  });

  test('teardown', (t) => {
    server.close();
    client.destroy();
    t.end();
  });

  suite.end();
});
