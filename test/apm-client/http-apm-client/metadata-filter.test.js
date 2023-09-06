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

test('addMetadataFilter', function (t) {
  let theMetadata;

  const server = APMServer(function (req, res) {
    const objStream = processIntakeReq(req);
    let n = 0;
    objStream.on('data', function (obj) {
      if (++n === 1) {
        theMetadata = obj.metadata;
      }
    });
    objStream.on('end', function () {
      res.statusCode = 202;
      res.end();
    });
  });

  server.client({ apmServerVersion: '8.0.0' }, function (client) {
    client.addMetadataFilter(function (md) {
      delete md.process.argv;
      md.labels = { foo: 'bar' };
      return md;
    });

    client.sendSpan({ foo: 42 });
    client.flush(function () {
      t.ok(theMetadata, 'APM server got metadata');
      t.equal(
        theMetadata.process.argv,
        undefined,
        'metadata.process.argv was removed',
      );
      t.equal(theMetadata.labels.foo, 'bar', 'metadata.labels.foo was added');
      client.end();
      server.close();
      t.end();
    });
  });
});
