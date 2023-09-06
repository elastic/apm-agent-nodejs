/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test usage of `expectExtraMetadata: true` and `setExtraMetadata()`.

const test = require('tape');
const utils = require('./lib/utils');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;

test('expectExtraMetadata and setExtraMetadata used properly', function (t) {
  const apmEvents = [];

  const server = APMServer(function (req, res) {
    const objStream = processIntakeReq(req);
    objStream.on('data', function (obj) {
      apmEvents.push(obj);
    });
    objStream.on('end', function () {
      res.statusCode = 202;
      res.end();
    });
  }).client(
    { expectExtraMetadata: true, apmServerVersion: '8.0.0' },
    function (client) {
      client.setExtraMetadata({
        foo: 'bar',
        service: {
          runtime: {
            name: 'MyLambda',
          },
        },
      });
      client.sendTransaction({ req: 1 });

      client.flush(() => {
        t.equal(apmEvents.length, 2, 'APM Server got 2 events');
        t.ok(apmEvents[0].metadata, 'event 0 is metadata');
        t.equal(
          apmEvents[0].metadata.foo,
          'bar',
          'setExtraMetadata added "foo" field',
        );
        t.equal(
          apmEvents[0].metadata.service.runtime.name,
          'MyLambda',
          'setExtraMetadata set nested service.runtime.name field properly',
        );
        t.ok(apmEvents[1].transaction, 'event 1 is a transaction');

        client.end();
        server.close();
        t.end();
      });
    },
  );
});

test('empty setExtraMetadata is fine, and calling after send* is fine', function (t) {
  const apmEvents = [];

  const server = APMServer(function (req, res) {
    const objStream = processIntakeReq(req);
    objStream.on('data', function (obj) {
      apmEvents.push(obj);
    });
    objStream.on('end', function () {
      res.statusCode = 202;
      res.end();
    });
  }).client(
    { expectExtraMetadata: true, apmServerVersion: '8.0.0' },
    function (client) {
      client.sendTransaction({ req: 1 });
      client.setExtraMetadata();

      client.flush(() => {
        t.equal(apmEvents.length, 2, 'APM Server got 2 events');
        t.ok(apmEvents[0].metadata, 'event 0 is metadata');
        t.ok(apmEvents[1].transaction, 'event 1 is a transaction');

        client.end();
        server.close();
        t.end();
      });
    },
  );
});

test('expectExtraMetadata:true with *no* setExtraMetadata call results in a corked client', function (t) {
  const server = APMServer(function (req, res) {
    t.fail('do NOT expect to get intake request to APM server');
  }).client(
    { expectExtraMetadata: true, apmServerVersion: '8.0.0' },
    function (client) {
      // Explicitly *not* calling setExtraMetadata().
      client.sendTransaction({ req: 1 });

      client.flush(() => {
        t.fail('should *not* callback from flush');
      });
      setTimeout(() => {
        t.pass('hit timeout without an intake request to APM server');
        client.destroy();
        server.close();
        t.end();
      }, 1000);
    },
  );
});
