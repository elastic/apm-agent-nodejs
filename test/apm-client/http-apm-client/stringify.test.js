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

const dataTypes = ['transaction', 'error'];
const properties = ['request', 'response'];

const upper = {
  transaction: 'Transaction',
  error: 'Error',
};

dataTypes.forEach(function (dataType) {
  properties.forEach(function (prop) {
    const sendFn = 'send' + upper[dataType];

    test(`stringify ${dataType} ${prop} headers`, function (t) {
      t.plan(
        assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
      );
      const datas = [
        assertMetadata,
        assertEvent({
          [dataType]: {
            context: {
              [prop]: {
                headers: {
                  string: 'foo',
                  number: '42',
                  bool: 'true',
                  nan: 'NaN',
                  object: '[object Object]',
                  array: ['foo', '42', 'true', 'NaN', '[object Object]'],
                },
              },
            },
          },
        }),
      ];
      const server = APMServer(function (req, res) {
        assertIntakeReq(t, req);
        req = processIntakeReq(req);
        req.on('data', function (obj) {
          datas.shift()(t, obj);
        });
        req.on('end', function () {
          res.end();
          server.close();
          t.end();
        });
      }).client({ apmServerVersion: '8.0.0' }, function (client) {
        client[sendFn]({
          context: {
            [prop]: {
              headers: {
                string: 'foo',
                number: 42,
                bool: true,
                nan: NaN,
                object: { foo: 'bar' },
                array: ['foo', 42, true, NaN, { foo: 'bar' }],
              },
            },
          },
        });
        client.flush(function () {
          client.destroy(); // Destroy keep-alive agent when done on client-side.
        });
      });
    });
  });
});
