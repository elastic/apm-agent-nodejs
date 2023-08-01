/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var test = require('tape');

const http = require('http');
const { httpRequest } = require('../lib/http-request');
const shimmer = require('../lib/instrumentation/shimmer');

test('httpRequest - no timeouts', function (t) {
  const server = http
    .createServer(function onReq(_req, res) {
      res.end('hi');
    })
    .listen(function onListening() {
      const port = server.address().port;
      const req = httpRequest(`http://127.0.0.1:${port}`, function onRes(res) {
        t.equal(res.statusCode, 200, 'got 200 response');
        server.close(function () {
          t.end();
        });
      });
      req.end();
    });
});

test('httpRequest - get timeout', function (t) {
  // 1. Start a server with a slow (500s) response time.
  const server = http
    .createServer(function onReq(_req, res) {
      setTimeout(function () {
        res.end('hi');
      }, 500);
    })
    .listen(function onListening() {
      const port = server.address().port;

      // 2. Make a request to that server that we expect to *timeout*.
      const req = httpRequest(
        `http://127.0.0.1:${port}`,
        {
          connectTimeout: 30,
          timeout: 100,
        },
        function onRes(res) {
          t.fail('got client response, but did not expect it');
        },
      );

      // 3. Get a 'timeout' event.
      req.on('timeout', function () {
        t.pass('got timeout event, as expected');
        // 4. It is the responsibility of the caller to clean up the request.
        req.destroy(new Error('cleaning up after timeout'));
      });

      req.on('connectTimeout', function () {
        t.fail('got connectTimeout, but did not expect it');
      });

      // 5. We expect an 'error' event from our self-called `res.destroy()`.
      req.on('error', function (err) {
        t.ok(err);
        t.equal(err.message, 'cleaning up after timeout');
        server.close(function () {
          t.end();
        });
      });

      req.end();
    });
});

test('httpRequest - get connectTimeout', function (t) {
  // A torturous Node.js http client Agent that breaks all socket connections
  // by throwing away the 'connect' event on any created sockets.
  class MyHttpAgent extends http.Agent {
    createConnection(opts, cb) {
      const socket = super.createConnection(opts, cb);
      shimmer.wrap(socket, 'emit', function (origEmit) {
        return function wrappedEmit(name) {
          if (name === 'connect') {
            return;
          }
          return origEmit.call(this, ...arguments);
        };
      });
      return socket;
    }
  }

  const server = http.createServer((req, res) => {
    res.end('hi');
  });
  server.listen(0, () => {
    // 1. Send a request to a normal server, using a client HTTP agent that
    // makes all connections time out.
    const req = httpRequest(
      `http://127.0.0.1:${server.address().port}`,
      {
        connectTimeout: 100,
        timeout: 5000,
        agent: new MyHttpAgent(),
      },
      function onRes(res) {
        t.fail('got client response, but did not expect it');
      },
    );

    req.on('timeout', function () {
      t.fail('got timeout, but did not expect it');
    });

    // 2. Get a 'connectTimeout' event.
    req.on('connectTimeout', function () {
      t.pass('got connectTimeout event, as expected');
      // 3. It is the responsibility of the caller to clean up the request.
      req.destroy(new Error('cleaning up after connectTimeout'));
    });

    // 4. We expect an 'error' event from our self-called `res.destroy()`.
    req.on('error', function (err) {
      t.ok(err);
      t.equal(err.message, 'cleaning up after connectTimeout');
      t.end();
      server.close();
    });

    req.end();
  });
});
