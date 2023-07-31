/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test usage of `extraMetadata: ...`.

const test = require('tape');
const utils = require('./lib/utils');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;

test('extraMetadata', function (t) {
  const apmEvents = [];
  const extraMetadata = {
    foo: 'bar',
    service: {
      language: {
        name: 'spam',
      },
    },
  };

  const server = APMServer(function (req, res) {
    const objStream = processIntakeReq(req);
    objStream.on('data', function (obj) {
      apmEvents.push(obj);
    });
    objStream.on('end', function () {
      res.statusCode = 202;
      res.end();
    });
  }).client({ extraMetadata, apmServerVersion: '8.0.0' }, function (client) {
    client.sendTransaction({ req: 1 });

    client.flush(() => {
      t.equal(apmEvents.length, 2, 'APM Server got 2 events');
      t.ok(apmEvents[0].metadata, 'event 0 is metadata');
      t.equal(
        apmEvents[0].metadata.foo,
        'bar',
        'extraMetadata added "foo" field',
      );
      t.equal(
        apmEvents[0].metadata.service.language.name,
        'spam',
        'extraMetadata overrode nested service.language.name field properly',
      );
      t.ok(apmEvents[1].transaction, 'event 1 is a transaction');

      client.end();
      server.close();
      t.end();
    });
  });
});
