/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const tape = require('tape');
const http = require('http');
const {
  getUrlFromRequestAndOptions,
} = require('../../../../lib/instrumentation/http-shared');

// Creates a ClientRequest from options
//
// Creates and request an immediatly aborts/destroys it.
// This allows us to test with real ClientRequest objects
// and ensure their underlying properties are stable/consistant
// across versions.
//
// @param {options} options
// @return {ClientRequest}
function requestFromOptions(options) {
  const req = http.request(options);
  req.on('error', function () {});
  req.destroy();
  return req;
}

tape('getUrlFromRequestAndOptions tests', function (suite) {
  suite.test('options with host', function (t) {
    const options = {
      host: 'example.com',
    };
    const req = requestFromOptions(options);

    const url = getUrlFromRequestAndOptions(req, options);
    t.equals(url, 'http://example.com/', 'url rendered as expected');
    t.end();
  });

  suite.test('options with host and path', function (t) {
    const options = {
      host: 'example.com',
      path: '/foo',
    };
    const req = requestFromOptions(options);

    const url = getUrlFromRequestAndOptions(req, options);
    t.equals(url, 'http://example.com/foo', 'url rendered as expected');
    t.end();
  });

  suite.test('options with host, path, port, and a query string', function (t) {
    const options = {
      host: 'example.com',
      path: '/foo?fpp=bar',
      port: 32,
    };
    const req = requestFromOptions(options);

    const url = getUrlFromRequestAndOptions(req, options);
    t.equals(
      url,
      'http://example.com:32/foo?fpp=bar',
      'url rendered as expected',
    );
    t.end();
  });

  suite.test(
    'options with host, path, port, query string, and a username/password',
    function (t) {
      const options = {
        host: 'example.com',
        path: '/foo?fpp=bar',
        auth: 'username:password',
        port: 32,
      };
      const req = requestFromOptions(options);

      const url = getUrlFromRequestAndOptions(req, options);
      t.equals(
        url,
        'http://example.com:32/foo?fpp=bar',
        'url rendered as expected',
      );
      t.equals(url.indexOf('username'), -1, 'no auth information in url');
      t.equals(url.indexOf('password'), -1, 'no auth information in url');
      t.end();
    },
  );

  suite.test('options with host and hostname', function (t) {
    const options = {
      host: 'two.example.com',
      hostname: 'one.example.com',
      path: '/bar',
      auth: 'username:password',
    };
    const req = requestFromOptions(options);
    const url = getUrlFromRequestAndOptions(req, options);
    t.equals(
      url,
      'http://one.example.com/bar',
      'url rendered as expected (hostname wins)',
    );
    t.equals(url.indexOf('username'), -1, 'no auth information in url');
    t.equals(url.indexOf('password'), -1, 'no auth information in url');
    t.end();
  });

  suite.test('does not crash with unexpected data', function (t) {
    const options = {
      host: 'two.example.com',
      hostname: 'one.example.com',
      path: '/bar',
    };
    const req = requestFromOptions(options);

    const url1 = getUrlFromRequestAndOptions(null, null);
    const url2 = getUrlFromRequestAndOptions(req, null);
    const url3 = getUrlFromRequestAndOptions(null, options);

    t.equal(url1, undefined, 'no url returned');
    t.ok(url2, 'URL returned');
    t.equal(url3, undefined, 'no url returned');
    t.end();
  });

  suite.test('port 80 makes it through', function (t) {
    const options = {
      host: 'two.example.com',
      port: 80,
    };
    const req = requestFromOptions(options);

    const url = getUrlFromRequestAndOptions(req, options);
    t.equals(url, 'http://two.example.com:80/', 'port 80 made it thorugh');
    t.end();
  });

  suite.test('missing protocol', function (t) {
    const options = {
      hostname: 'localhost',
      path: '/get',
      // A custom agent that implements the minimum to pass muster, but does
      // *not* define `agent.protocol`.
      agent: {
        addRequest() {},
      },
    };
    const req = requestFromOptions(options);

    const url = getUrlFromRequestAndOptions(req, options, 'http:');
    t.equals(url, 'http://localhost/get', 'protocol falls back correctly');
    t.end();
  });
  suite.end();
});
