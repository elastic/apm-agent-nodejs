/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const { APMServer, validOpts, assertConfigReq } = require('./lib/utils');
const {
  getCentralConfigIntervalS,
  INTERVAL_DEFAULT_S,
  INTERVAL_MIN_S,
  INTERVAL_MAX_S,
} = require('../../../lib/apm-client/http-apm-client/central-config');
const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');

test('getCentralConfigIntervalS', function (t) {
  const testCases = [
    // [ <input arg>, <expected result> ]
    [-4, INTERVAL_DEFAULT_S],
    [-1, INTERVAL_DEFAULT_S],
    [0, 300],
    [1, INTERVAL_MIN_S],
    [2, INTERVAL_MIN_S],
    [3, INTERVAL_MIN_S],
    [4, INTERVAL_MIN_S],
    [5, INTERVAL_MIN_S],
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 9],
    [10, 10],
    [86398, 86398],
    [86399, 86399],
    [86400, 86400],
    [86401, INTERVAL_MAX_S],
    [86402, INTERVAL_MAX_S],
    [86403, INTERVAL_MAX_S],
    [86404, INTERVAL_MAX_S],
    [NaN, INTERVAL_DEFAULT_S],
    [null, INTERVAL_DEFAULT_S],
    [undefined, INTERVAL_DEFAULT_S],
    [false, INTERVAL_DEFAULT_S],
    [true, INTERVAL_DEFAULT_S],
    ['a string', INTERVAL_DEFAULT_S],
    [{}, INTERVAL_DEFAULT_S],
    [[], INTERVAL_DEFAULT_S],
  ];

  testCases.forEach((testCase) => {
    t.equal(
      getCentralConfigIntervalS(testCase[0]),
      testCase[1],
      `getCentralConfigIntervalS(${testCase[0]}) -> ${testCase[1]}`,
    );
  });
  t.end();
});

test('central config disabled', function (t) {
  const origPollConfig = HttpApmClient.prototype._pollConfig;
  HttpApmClient.prototype._pollConfig = function () {
    t.fail('should not call _pollConfig');
  };

  t.on('end', function () {
    HttpApmClient.prototype._pollConfig = origPollConfig;
  });

  HttpApmClient(validOpts());
  t.end();
});

test('central config enabled', function (t) {
  t.plan(1);

  const origPollConfig = HttpApmClient.prototype._pollConfig;
  HttpApmClient.prototype._pollConfig = function () {
    t.pass('should call _pollConfig');
  };

  t.on('end', function () {
    HttpApmClient.prototype._pollConfig = origPollConfig;
  });

  HttpApmClient(validOpts({ centralConfig: true }));
  t.end();
});

// Test central-config handling of Etag and If-None-Match headers using a mock
// apm-server that uses the `Cache-Control: max-age=1 ...` header to speed up
// the polling interval of the client. (This is foiled by `INTERVAL_MIN_S = 5`.)
test('polling', function (t) {
  const expectedConf = { foo: 'bar' };
  const headers = { 'Cache-Control': 'max-age=1, must-revalidate' };
  let reqs = 0;
  let client;

  const server = APMServer(function (req, res) {
    assertConfigReq(t, req);

    switch (++reqs) {
      case 1:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(
          500,
          Object.assign({ 'Content-Type': 'application/json' }, headers),
        );
        res.end('{"invalid JSON"}');
        break;
      case 2:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(
          503,
          Object.assign({ 'Content-Type': 'application/json' }, headers),
        );
        res.end(JSON.stringify('valid JSON'));
        break;
      case 3:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(
          503,
          Object.assign({ 'Content-Type': 'application/json' }, headers),
        );
        res.end(JSON.stringify({ error: 'from error property' }));
        break;
      case 4:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(403, headers);
        res.end();
        break;
      case 5:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(404, headers);
        res.end();
        break;
      case 6:
        t.ok(
          !('if-none-match' in req.headers),
          'should not have If-None-Match header',
        );
        res.writeHead(200, Object.assign({ Etag: '"42"' }, headers));
        res.end(JSON.stringify(expectedConf));
        break;
      case 7:
        t.equal(req.headers['if-none-match'], '"42"');
        res.writeHead(304, Object.assign({ Etag: '"42"' }, headers));
        res.end();
        client.destroy();
        server.close();
        break;
      default:
        t.fail('too many request');
    }
  }).client(
    { centralConfig: true, apmServerVersion: '8.0.0' },
    function (_client) {
      client = _client;
      client.on('config', function (conf) {
        t.equal(reqs, 6, 'should emit config after 6th request');
        t.deepEqual(conf, expectedConf);
      });
      client.on('request-error', function (err) {
        if (reqs === 1) {
          t.equal(err.code, 500);
          t.equal(
            err.message,
            'Unexpected APM Server response when polling config',
          );
          t.equal(err.response, '{"invalid JSON"}');
        } else if (reqs === 2) {
          t.equal(err.code, 503);
          t.equal(
            err.message,
            'Unexpected APM Server response when polling config',
          );
          t.equal(err.response, 'valid JSON');
        } else if (reqs === 3) {
          t.equal(err.code, 503);
          t.equal(
            err.message,
            'Unexpected APM Server response when polling config',
          );
          t.equal(err.response, 'from error property');
        } else if (reqs === 7) {
          // The mock APMServer above hard-destroys the connection on req 7. If
          // the client's keep-alive agent has an open socket, we expect a
          // "socket hang up" (ECONNRESET) error here.
          t.equal(err.message, 'socket hang up');
          t.end();
        } else {
          t.error(err, 'got an err on req ' + reqs + ', err=' + err.message);
        }
      });
    },
  );
});
