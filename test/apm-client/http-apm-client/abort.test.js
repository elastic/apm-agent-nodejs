/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');
const utils = require('./lib/utils');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;
const assertIntakeReq = utils.assertIntakeReq;
const assertMetadata = utils.assertMetadata;
const assertEvent = utils.assertEvent;

test('abort request if server responds early', function (t) {
  t.plan(
    assertIntakeReq.asserts * 2 +
      assertMetadata.asserts +
      assertEvent.asserts +
      2,
  );

  let reqs = 0;
  let client;

  const datas = [assertMetadata, assertEvent({ span: { foo: 2 } })];

  const timer = setTimeout(function () {
    throw new Error('the test got stuck');
  }, 5000);

  const server = APMServer(function (req, res) {
    const reqNo = ++reqs;

    assertIntakeReq(t, req);

    if (reqNo === 1) {
      res.writeHead(500);
      res.end('bad');

      // Wait a little to ensure the current stream have ended, so the next
      // span will force a new stream to be created
      setTimeout(function () {
        client.sendSpan({ foo: 2 });
        client.flush();
      }, 50);
    } else if (reqNo === 2) {
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
        clearTimeout(timer);
        server.close();
        client.destroy(); // Destroy keep-alive agent.
        t.end();
      });
    } else {
      t.fail('should not get more than two requests');
    }
  }).client({ apmServerVersion: '8.0.0' }, function (_client) {
    client = _client;
    client.sendSpan({ foo: 1 });
    client.on('request-error', function (err) {
      t.equal(
        err.code,
        500,
        'should generate request-error with 500 status code',
      );
      t.equal(
        err.response,
        'bad',
        'should generate request-error with expected body',
      );
    });
  });
});
