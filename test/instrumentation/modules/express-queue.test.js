/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

var http = require('http');

var express = require('express');
var queue = require('express-queue');
var test = require('tape');

var mockClient = require('../../_mock_http_client');
var findObjInArray = require('../../_utils').findObjInArray;

test('express-queue', function (t) {
  resetAgent(done(t, 'done'));

  var app = express();
  app.use(queue({ activeLimit: 1, queuedLimit: -1 }));
  app.get('/', function (req, res) {
    setImmediate(function () {
      var span = agent.startSpan('foo', 'bar');
      setImmediate(function () {
        if (span) span.end();
        res.end('done');
      });
    });
  });

  var server = app.listen(function () {
    var port = server.address().port;
    var path = '/';

    var tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(request(port, path));
    }

    Promise.all(tasks).then(done, done);

    function done() {
      agent.flush();
      server.close();
    }
  });
});

function request(port, path) {
  return new Promise((resolve, reject) => {
    var opts = {
      method: 'GET',
      port,
      path,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    var req = http.request(opts, function (res) {
      var chunks = [];
      res.on('error', reject);
      res.on('data', chunks.push.bind(chunks));
      res.on('end', function () {
        resolve(Buffer.concat(chunks).toString());
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function done(t, query) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 5);

    data.transactions.forEach(function (trans, i) {
      t.comment('request ' + (i + 1));
      t.strictEqual(trans.name, 'GET /', 'name should be GET /');
      t.strictEqual(trans.type, 'request', 'type should be request');
      t.strictEqual(
        data.spans.filter((span) => span.transaction_id === trans.id).length,
        1,
        'transaction should have 1 span',
      );
      const span = findObjInArray(data.spans, 'transaction_id', trans.id);
      t.strictEqual(span.name, 'foo', 'span name should be foo');
      t.strictEqual(span.type, 'bar', 'span name should be bar');

      var offset = span.timestamp - trans.timestamp;
      t.ok(
        offset + span.duration * 1000 < trans.duration * 1000,
        'span should have valid timings',
      );
    });

    t.end();
  };
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(10, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
