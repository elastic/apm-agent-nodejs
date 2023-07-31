/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var agent = require('../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
});
var ins = agent._instrumentation;

var fs = require('fs');
var https = require('https');
var http2 = require('http2');

var semver = require('semver');
var pem = require('https-pem');
var test = require('tape');

var mockClient = require('../../_mock_http_client');
const constants = require('../../../lib/constants');

if (semver.satisfies(process.version, '8.x')) {
  console.log('# SKIP http2 testing on node v8.x is crashy in CI');
  process.exit();
}

var isSecure = [false, true];
isSecure.forEach((secure) => {
  var method = secure ? 'createSecureServer' : 'createServer';

  test(`http2.${method} compatibility mode`, (t) => {
    t.plan(16);

    // Note NODE_OPTIONS env because it sometimes has a setting relevant
    // for this test.
    t.comment(`NODE_OPTIONS=${process.env.NODE_OPTIONS || ''}`);

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
    });

    function onRequest(req, res) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      res.writeHead(200, {
        'content-type': 'text/plain',
      });
      res.end('foo');
    }

    var port;
    var server = secure
      ? http2.createSecureServer(pem, onRequest)
      : http2.createServer(onRequest);

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, 'foo');
      req.resume();
      req.on('end', () => client.destroy());
      req.end();
    });
  });

  test(`http2.${method} stream respond`, (t) => {
    t.plan(16);

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
    });

    var port;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      stream.respond({
        'content-type': 'text/plain',
        ':status': 200,
      });
      stream.end('foo');
    });

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, 'foo');
      req.resume();
      req.on('end', () => client.destroy());
      req.end();
    });
  });

  test(`http2.${method} stream end after session destroy`, (t) => {
    t.plan(16);

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
    });

    var port;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      stream.respond({
        'content-type': 'text/plain',
        ':status': 200,
      });

      // Destroying the Http2Session results in any usage of the
      // `stream.session.socket` proxy possibly throwing
      // `ERR_HTTP2_SOCKET_UNBOUND`. This test case ensures the APM agent
      // doesn't blow up on this.
      stream.session.destroy();

      stream.end('foo');
    });

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, ''); // Do not expect 'foo' to get through.
      req.resume();
      req.on('end', () => client.destroy());
      req.end();
    });
  });

  test(`http2.${method} stream respondWithFD`, (t) => {
    t.plan(17);

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
    });

    var port;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      fs.open(__filename, 'r', function (err, fd) {
        t.error(err);

        stream.respondWithFD(fd, {
          ':status': 200,
          'content-type': 'text/plain',
        });

        stream.on('close', function () {
          fs.close(fd, function () {});
        });
      });
    });

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, fs.readFileSync(__filename).toString());
      req.resume();
      req.on('end', () => client.destroy());
      req.end();
    });
  });

  test(`http2.${method} stream respondWithFile`, (t) => {
    t.plan(16);

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
    });

    var port;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      stream.respondWithFile(__filename, {
        ':status': 200,
        'content-type': 'text/plain',
      });
    });

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, fs.readFileSync(__filename).toString());
      req.resume();
      req.on('end', () => client.destroy());
      req.end();
    });
  });

  test(`http2.${method} ignore push streams`, (t) => {
    addShouldCall(t);

    var done = after(3, () => {
      client.destroy();
      t.end();
    });

    resetAgent((data) => {
      assert(t, data, secure, port);
      server.close();
      done();
    });

    var port;
    var client;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      function onPushStream(stream, headers) {
        stream.respond({
          'content-type': 'text/plain',
          ':status': 200,
        });
        stream.end('some pushed data');
        done();
      }

      stream.pushStream(
        { ':path': '/pushed' },
        t.shouldCall(
          semver.lt(process.version, '8.11.2-rc')
            ? onPushStream
            : (err, pushStream, headers) => {
                t.error(err);
                onPushStream(pushStream, headers);
              },
        ),
      );

      stream.respond({
        'content-type': 'text/plain',
        ':status': 200,
      });
      stream.end('foo');
    });

    server.listen(() => {
      port = server.address().port;
      client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      // Receive push stream
      client.on(
        'stream',
        t.shouldCall((stream, headers, flags) => {
          t.strictEqual(headers[':path'], '/pushed');
          assertResponse(t, stream, 'some pushed data', done);
        }),
      );

      var req = client.request({ ':path': '/' });
      assertResponse(t, req, 'foo');
      req.end();
    });
  });

  // Scenario:
  // - create a manual transaction (expect transaction)
  // - http2 client "GET /" request (expect span, then HTTP/2 transaction)
  // - http2 client "GET /sub" request inside server handler (expect span,
  //   then HTTP/2 transcation)
  test(`http2.request${secure ? ' secure' : ' '}`, (t) => {
    resetAgent(5, (data) => {
      t.strictEqual(data.transactions.length, 3);
      t.strictEqual(data.spans.length, 2);
      const transactions = data.transactions.sort((a, b) => {
        return a.timestamp < b.timestamp ? -1 : 1;
      });
      const spans = data.spans.sort((a, b) => {
        return a.timestamp < b.timestamp ? -1 : 1;
      });

      const transManual = transactions[0];
      t.equal(transManual.name, 'manual', 'transManual.name');

      const expectedSpanContextFromPath = (urlPath) => {
        return {
          service: { target: { type: 'http', name: `localhost:${port}` } },
          destination: {
            address: 'localhost',
            port,
            service: { type: '', name: '', resource: `localhost:${port}` },
          },
          http: {
            method: 'GET',
            status_code: 200,
            url: `http${secure ? 's' : ''}://localhost:${port}${urlPath}`,
          },
        };
      };
      let span = spans[0];
      t.strictEqual(
        span.name,
        `GET http${secure ? 's' : ''}://localhost:${port}`,
        'span.name',
      );
      t.strictEqual(span.type, 'external', 'span.type');
      t.strictEqual(span.subtype, 'http', 'span.subtype');
      t.strictEqual(span.action, 'GET', 'span.action');
      t.strictEqual(span.trace_id, transManual.trace_id, 'span.trace_id');
      t.strictEqual(span.parent_id, transManual.id, 'span.parent_id');
      t.deepEqual(
        span.context,
        expectedSpanContextFromPath('/'),
        'span.context',
      );

      const transRoot = transactions[1];
      t.equal(transRoot.trace_id, transManual.trace_id, 'transRoot.trace_id');
      t.equal(transRoot.parent_id, span.id, 'transRoot.parent_id');
      assertPath(t, transRoot, secure, port, '/', '2.0');

      span = spans[1];
      t.strictEqual(
        span.name,
        `GET http${secure ? 's' : ''}://localhost:${port}`,
        'span.name',
      );
      t.strictEqual(span.type, 'external', 'span.type');
      t.strictEqual(span.subtype, 'http', 'span.subtype');
      t.strictEqual(span.action, 'GET', 'span.action');
      t.strictEqual(span.trace_id, transRoot.trace_id, 'span.trace_id');
      t.strictEqual(span.parent_id, transRoot.id, 'span.parent_id');
      t.deepEqual(
        span.context,
        expectedSpanContextFromPath('/sub'),
        'span.context',
      );

      const transSub = transactions[2];
      t.equal(transSub.trace_id, transRoot.trace_id, 'transSub.trace_id');
      t.equal(transSub.parent_id, span.id, 'transSub.parent_id');
      assertPath(t, transSub, secure, port, '/sub', '2.0');

      server.close();
      t.end();
    });

    var port;
    var server = secure ? http2.createSecureServer(pem) : http2.createServer();

    var onError = (err) => t.error(err);
    server.on('error', onError);
    server.on('socketError', onError);

    server.on('stream', function (stream, headers) {
      var trans = ins.currTransaction();
      t.ok(trans, 'have current transaction');
      t.strictEqual(trans.type, 'request');

      if (headers[':path'] === '/') {
        var client = connect(secure, port);
        client.on('error', onError);
        client.on('socketError', onError);

        stream.respond({
          'content-type': 'text/plain',
          ':status': 200,
        });

        var req = client.request({ ':path': '/sub' });
        t.ok(
          agent.currentSpan === null,
          'the http2 span should not spill into user code',
        );
        req.on('end', () => {
          t.ok(
            agent.currentSpan === null,
            'the http2 span should *not* be the currentSpan in user event handlers',
          );
          client.destroy();
        });
        req.pipe(stream);
      } else {
        stream.respond({
          'content-type': 'text/plain',
          ':status': 200,
        });
        stream.end('foo');
      }
    });

    server.listen(() => {
      port = server.address().port;
      var client = connect(secure, port);
      client.on('error', onError);
      client.on('socketError', onError);

      const transManual = agent.startTransaction('manual');
      var req = client.request({ ':path': '/' });
      assertResponse(t, req, 'foo');
      req.resume();
      req.on('end', () => {
        client.destroy();
        transManual.end();
      });
      req.end();
    });
  });
});

test('handling HTTP/1.1 request to http2.createSecureServer with allowHTTP1:true', (t) => {
  // Note NODE_OPTIONS env because it sometimes has a setting relevant
  // for this test.
  t.comment(`NODE_OPTIONS=${process.env.NODE_OPTIONS || ''}`);

  let tx;
  resetAgent(1, (data) => {
    t.equal(data.length, 1, 'got just the one data event');
    tx = data.transactions[0];
  });

  var port;
  var serverOpts = Object.assign({ allowHTTP1: true }, pem);
  var server = http2.createSecureServer(serverOpts);
  server.on('request', function onRequest(req, res) {
    var trans = ins.currTransaction();
    t.ok(trans, 'have current transaction');
    t.strictEqual(trans.type, 'request');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('foo');
  });
  server.on('error', function (err) {
    t.fail('http2 server error event:' + err);
  });
  server.listen(() => {
    port = server.address().port;

    // Make an HTTP/1.1 request.
    var getOpts = {
      agent: new https.Agent(),
      protocol: 'https:',
      host: 'localhost',
      port,
      path: '/',
      ALPNProtocols: ['http/1.1'],
      rejectUnauthorized: false,
    };
    var req = https.get(getOpts, function (res) {
      assertResponse(t, res, 'foo', function () {
        // Assert the APM transaction is as expected for an HTTP/1.x request.
        t.ok(tx, 'got the transaction');
        assertPath(t, tx, true, port, '/', '1.1');

        server.close();
        t.end();
      });
    });
    req.on('error', function (err) {
      t.fail('HTTP/1.1 client request error event: ' + err);
    });
  });
});

var matchId = /^[\da-f]{16}$/;

function assertPath(t, trans, secure, port, path, httpVersion) {
  t.ok(trans);
  t.ok(matchId.test(trans.id));
  t.strictEqual(trans.name, 'GET unknown route');
  t.strictEqual(trans.type, 'request');
  if (httpVersion === '1.1' && secure) {
    // Drop this if-block when result and outcome are fixed for https:
    // https://github.com/elastic/apm-agent-nodejs/issues/2146
    t.strictEqual(trans.result, 'success', 'trans.result');
    t.strictEqual(trans.outcome, 'unknown', 'trans.outcome');
  } else {
    t.strictEqual(trans.result, 'HTTP 2xx', 'trans.result is "HTTP 2xx"');
    t.strictEqual(trans.outcome, 'success', 'trans.outcome is success');
  }
  t.ok(trans.duration > 0);
  t.ok(trans.timestamp > 0);

  let expectedUrl;
  let expectedReqHeaders;
  let expectedResHeaders;

  switch (httpVersion) {
    case '1.1':
      expectedUrl = {
        raw: path,
        protocol: secure ? 'https:' : 'http:',
        hostname: 'localhost',
        port: port.toString(),
        pathname: path,
        full: `https://localhost:${port}/`,
      };
      expectedReqHeaders = {
        host: `localhost:${port}`,
        connection: 'close',
      };
      expectedResHeaders = {
        'content-type': 'text/plain',
        date: trans.context.response.headers.date,
        connection: 'close',
        'transfer-encoding': 'chunked',
      };
      break;
    case '2.0':
      expectedUrl = {
        raw: path,
        protocol: 'http:',
        pathname: path,
      };
      expectedReqHeaders = {
        ':scheme': secure ? 'https' : 'http',
        // Until https://github.com/elastic/apm/pull/575 is discussed the
        // `:authority` pseudo-header will get redacted by the default `*auth*`
        // pattern in `sanitizeFieldNames`.
        //   ':authority': `localhost:${port}`,
        ':authority': constants.REDACTED,
        ':method': 'GET',
        ':path': path,
      };
      expectedResHeaders = {
        'content-type': 'text/plain',
        ':status': 200,
      };
      break;
  }

  if (trans.context.request.headers.traceparent) {
    expectedReqHeaders.traceparent = trans.context.request.headers.traceparent;
    expectedReqHeaders.tracestate = trans.context.request.headers.tracestate;
    expectedReqHeaders['elastic-apm-traceparent'] =
      trans.context.request.headers['elastic-apm-traceparent'];
  }

  // What is "expected" for transaction.context.request.socket.remote_address
  // is a bit of a pain.
  if (httpVersion === '1.1' && semver.lt(process.version, '8.17.0')) {
    // Before node v8.17.0 `socket.remoteAddress` was not set for https.
    t.pass(
      `skip checking on transaction.context.request.socket.remote_address on node ${process.version}`,
    );
  } else {
    // With node v17 on Linux (or at least on the linux containers used for
    // GitHub Action tests), the localhost socket.remoteAddress is "::1".
    t.ok(
      trans.context.request.socket.remote_address === '::ffff:127.0.0.1' ||
        trans.context.request.socket.remote_address === '::1',
      'transaction.context.request.socket.remote_address is as expected: ' +
        trans.context.request.socket.remote_address,
    );
  }
  delete trans.context.request.socket;

  t.deepEqual(
    trans.context.request,
    {
      http_version: httpVersion,
      method: 'GET',
      url: expectedUrl,
      headers: expectedReqHeaders,
    },
    'trans.context.request is as expected',
  );

  t.deepLooseEqual(
    trans.context.response,
    {
      status_code: 200,
      headers: expectedResHeaders,
    },
    'trans.context.response is as expected',
  );
}

function assert(t, data, secure, port) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 0);

  // Top-level props of the transaction need to be checked individually
  // because there are a few dynamic properties
  var trans = data.transactions[0];
  assertPath(t, trans, secure, port, '/', '2.0');
}

function assertResponse(t, stream, expected, done) {
  const chunks = [];
  stream.on('data', function (chunk) {
    chunks.push(chunk);
  });
  stream.on('end', function () {
    t.strictEqual(
      Buffer.concat(chunks).toString(),
      expected,
      'should have expected body',
    );
    if (done) done();
  });
}

function connect(secure, port) {
  var proto = secure ? 'https' : 'http';
  var opts = { rejectUnauthorized: false };
  return http2.connect(`${proto}://localhost:${port}`, opts);
}

function resetAgent(expected, cb) {
  if (typeof expected === 'function') return resetAgent(1, expected);
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(expected, cb);
}

function addShouldCall(t) {
  var calls = [];
  var realEnd = t.end;

  t.end = function end() {
    for (var i = 0; i < calls.length; i++) {
      t.strictEqual(calls[i].called, true, 'should have called function');
    }
    return realEnd.apply(this, arguments);
  };

  t.shouldCall = function shouldCall(fn) {
    var record = { called: false };
    calls.push(record);
    return function shouldCallWrap() {
      record.called = true;
      return fn.apply(this, arguments);
    };
  };
}

function after(n, fn) {
  return function () {
    --n || fn();
  };
}
