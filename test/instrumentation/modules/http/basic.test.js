/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-basic',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
});

var http = require('http');

var test = require('tape');

var assert = require('./_assert');
var mockClient = require('../../../_mock_http_client');
var { TraceParent } = require('../../../../lib/tracecontext/traceparent');

test('http.createServer', function (t) {
  t.test('direct callback', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = http.createServer(onRequest(t));
    sendRequest(server);
  });

  t.test('server.addListener()', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = http.createServer();
    server.addListener('request', onRequest(t));
    sendRequest(server);
  });

  t.test('server.on()', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = http.createServer();
    server.on('request', onRequest(t));
    sendRequest(server);
  });
});

test('new http.Server', function (t) {
  t.test('direct callback', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = new http.Server(onRequest(t));
    sendRequest(server);
  });

  t.test('server.addListener()', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = new http.Server();
    server.addListener('request', onRequest(t));
    sendRequest(server);
  });

  t.test('server.on()', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = new http.Server();
    server.on('request', onRequest(t));
    sendRequest(server);
  });

  t.test('support elastic-apm-traceparent header', function (t) {
    resetAgent(function (data) {
      assert(t, data);
      server.close();
      t.end();
    });

    var server = new http.Server();
    server.on('request', onRequest(t, true));
    sendRequest(server, undefined, true);
  });
});

function sendRequest(server, timeout, useElasticHeader) {
  server.listen(function () {
    var port = server.address().port;
    var context = TraceParent.startOrResume(null, {
      transactionSampleRate: 1.0,
    });

    const headers = {};
    const contextValue = context.toString();
    if (useElasticHeader) {
      headers['elastic-apm-traceparent'] = contextValue;
    } else {
      headers.traceparent = contextValue;
    }

    var req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/',
        method: 'GET',
        headers,
      },
      function (res) {
        if (timeout) throw new Error('should not get to here');
        res.resume();
      },
    );
    req.end();

    if (timeout) {
      process.nextTick(function () {
        req.abort();
      });
    }
  });
}

function onRequest(t, useElasticHeader) {
  return function onRequestHandler(req, res) {
    var traceparent = useElasticHeader
      ? req.headers['elastic-apm-traceparent']
      : req.headers.traceparent;
    var parent = TraceParent.fromString(traceparent);
    var traceContext = agent.currentTransaction._context;
    t.strictEqual(
      parent.traceId,
      traceContext.traceparent.traceId,
      'traceContext trace id matches parent trace id',
    );
    t.notEqual(
      parent.id,
      traceContext.traceparent.id,
      'traceContext id does not match parent id',
    );
    t.strictEqual(
      parent.flags,
      traceContext.traceparent.flags,
      'traceContext flags matches parent flags',
    );
    res.end();
  };
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
}
