/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const cluster = require('cluster');

if (cluster.isMaster) {
  const test = require('tape');

  const findObjInArray = require('../../../_utils').findObjInArray;

  test('http split disabling', (t) => {
    function makeTest(config, handler) {
      return (t) => {
        const worker = cluster.fork();
        worker.send(config);
        worker.on('message', (data) => {
          worker.disconnect();
          handler(t, data);
        });
      };
    }

    function assertTopTransaction(t, transactions) {
      const trans = findObjInArray(transactions, 'type', 'custom');
      t.ok(trans, 'found top transaction');
      t.strictEqual(trans.name, 'top', 'transaction name');
    }

    function assertRequestTransaction(t, transactions) {
      const trans = findObjInArray(transactions, 'type', 'request');
      t.ok(trans, 'found request transaction');
      t.strictEqual(trans.name, 'GET /', 'transaction name');
      t.strictEqual(trans.result, 'HTTP 2xx', 'transaction result');
      t.strictEqual(trans.context.request.method, 'GET', 'transaction method');
    }

    function assertSpan(t, span) {
      t.ok(/GET localhost:\d+$/.test(span.name), 'span name');
      t.strictEqual(span.type, 'external', 'span type');
      t.strictEqual(span.subtype, 'http', 'span subtype');
      t.strictEqual(span.action, 'GET', 'span action');
    }

    t.test(
      'incoming enabled + outgoing enabled',
      makeTest(
        {
          disableInstrumentations: '',
          instrumentIncomingHTTPRequests: true,
        },
        (t, data) => {
          t.strictEqual(data.transactions.length, 2, 'transaction count');
          t.strictEqual(data.spans.length, 1, 'span count');

          assertRequestTransaction(t, data.transactions);
          assertTopTransaction(t, data.transactions);
          assertSpan(t, data.spans[0]);

          t.end();
        },
      ),
    );

    t.test(
      'incoming enabled + outgoing disabled',
      makeTest(
        {
          disableInstrumentations: 'http',
          instrumentIncomingHTTPRequests: true,
        },
        (t, data) => {
          t.strictEqual(data.transactions.length, 2, 'transaction count');
          t.strictEqual(data.spans.length, 0, 'span count');

          assertRequestTransaction(t, data.transactions);
          assertTopTransaction(t, data.transactions);

          t.end();
        },
      ),
    );

    t.test(
      'incoming disabled + outgoing enabled',
      makeTest(
        {
          disableInstrumentations: '',
          instrumentIncomingHTTPRequests: false,
        },
        (t, data) => {
          t.strictEqual(data.transactions.length, 1, 'transaction count');
          t.strictEqual(data.spans.length, 1, 'span count');

          assertTopTransaction(t, data.transactions);
          assertSpan(t, data.spans[0]);

          t.end();
        },
      ),
    );

    t.test(
      'incoming disabled + outgoing disabled',
      makeTest(
        {
          disableInstrumentations: 'http',
          instrumentIncomingHTTPRequests: false,
        },
        (t, data) => {
          t.strictEqual(data.transactions.length, 1, 'transaction count');
          t.strictEqual(data.spans.length, 0, 'span count');

          assertTopTransaction(t, data.transactions);

          t.end();
        },
      ),
    );
  });
} else {
  const http = require('http');

  process.on('message', (config) => {
    class MockTransport {
      constructor() {
        this.transactions = [];
        this.spans = [];
      }

      config() {}

      sendSpan(span) {
        this.spans.push(span);
      }

      sendTransaction(transaction) {
        this.transactions.push(transaction);
      }
    }

    const mock = new MockTransport();

    const agent = require('../../../..').start(
      Object.assign(
        {
          captureExceptions: false,
          metricsInterval: 0,
          centralConfig: false,
          transport: () => mock,
        },
        config,
      ),
    );

    const express = require('express');

    const app = express();

    app.get('/', (req, res) => {
      res.end('hello');
    });

    let trans;
    sendRequest(app).then(() => {
      trans.end();
      setTimeout(() => {
        process.send(mock);
      }, 10);
    });

    function ping(url, fn = (res) => res.resume()) {
      return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.on('error', reject);
          res.on('end', resolve);
          fn(res);
        });
        req.on('error', reject);
      });
    }

    function sendRequest(app) {
      return new Promise((resolve, reject) => {
        const server = app.listen(function () {
          const port = server.address().port;
          trans = agent.startTransaction('top');
          ping(`http://localhost:${port}`).then(resolve, reject);
        });
      });
    }
  });
}
