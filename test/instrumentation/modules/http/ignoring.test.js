/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-ignoring',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
});

var http = require('http');

var test = require('tape');

var mockClient = require('../../../_mock_http_client');

const { WildcardMatcher } = require('../../../../lib/wildcard-matcher');

test('ignore url string - no match', function (t) {
  resetAgent(
    {
      ignoreUrlStr: ['/exact'],
    },
    function (data) {
      assertNoMatch(t, data);
      t.end();
    },
  );
  request('/not/exact');
});

test('ignore url string - match', function (t) {
  resetAgent(
    {
      ignoreUrlStr: ['/exact'],
    },
    function () {
      t.fail('should not have any data');
    },
  );
  request('/exact', null, function () {
    t.end();
  });
});

test('ignore url regex - no match', function (t) {
  resetAgent(
    {
      ignoreUrlRegExp: [/regex/],
    },
    function (data) {
      assertNoMatch(t, data);
      t.end();
    },
  );
  request('/no-match');
});

test('ignore url regex - match', function (t) {
  resetAgent(
    {
      ignoreUrlRegExp: [/regex/],
    },
    function () {
      t.fail('should not have any data');
    },
  );
  request('/foo/regex/bar', null, function () {
    t.end();
  });
});

test('ignore url wildcard - no match', function (t) {
  const wc = new WildcardMatcher();
  resetAgent(
    {
      transactionIgnoreUrlRegExp: [wc.compile('/wil*card')],
    },
    function (data) {
      assertNoMatch(t, data);
      t.end();
    },
  );
  request('/tamecard');
});

test('ignore url wildcard - match', function (t) {
  const wc = new WildcardMatcher();
  resetAgent(
    {
      transactionIgnoreUrlRegExp: [wc.compile('/wil*card')],
    },
    function () {
      t.fail('should not have any data');
    },
  );
  request('/wildcard', null, function () {
    t.end();
  });
});

test('ignore User-Agent string - no match', function (t) {
  resetAgent(
    {
      ignoreUserAgentStr: ['exact'],
    },
    function (data) {
      assertNoMatch(t, data);
      t.end();
    },
  );
  request('/', { 'User-Agent': 'not-exact' });
});

test('ignore User-Agent string - match', function (t) {
  resetAgent(
    {
      ignoreUserAgentStr: ['exact'],
    },
    function () {
      t.fail('should not have any data');
    },
  );
  request('/', { 'User-Agent': 'exact-start' }, function () {
    t.end();
  });
});

test('ignore User-Agent regex - no match', function (t) {
  resetAgent(
    {
      ignoreUserAgentRegExp: [/regex/],
    },
    function (data) {
      assertNoMatch(t, data);
      t.end();
    },
  );
  request('/', { 'User-Agent': 'no-match' });
});

test('ignore User-Agent regex - match', function (t) {
  resetAgent(
    {
      ignoreUserAgentRegExp: [/regex/],
    },
    function () {
      t.fail('should not have any data');
    },
  );
  request('/', { 'User-Agent': 'foo-regex-bar' }, function () {
    t.end();
  });
});

function assertNoMatch(t, data) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.transactions[0].name, 'GET unknown route');
}

function request(path, headers, cb) {
  var server = http.createServer(function (req, res) {
    res.end();
  });

  server.listen(function () {
    var opts = {
      port: server.address().port,
      path,
      headers,
    };
    http
      .request(opts, function (res) {
        res.on('end', function () {
          server.close();
          if (cb) setTimeout(cb, 100);
        });
        res.resume();
      })
      .end();
  });
}

function resetAgent(opts, cb) {
  agent._apmClient = mockClient(1, cb);
  agent._conf.ignoreUrlStr = opts.ignoreUrlStr || [];
  agent._conf.ignoreUrlRegExp = opts.ignoreUrlRegExp || [];
  agent._conf.ignoreUserAgentStr = opts.ignoreUserAgentStr || [];
  agent._conf.ignoreUserAgentRegExp = opts.ignoreUserAgentRegExp || [];
  agent._conf.transactionIgnoreUrlRegExp =
    opts.transactionIgnoreUrlRegExp || [];
  agent._instrumentation.testReset();
}
