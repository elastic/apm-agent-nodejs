/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// https://github.com/elastic/apm-agent-nodejs/issues/1770
const agent = require('../..').start({
  serviceName: 'test-github-issue-1770',
  centralConfig: false,
  metricsInterval: 0,
  logUncaughtExceptions: true,
});

const tape = require('tape');
const http = require('http');
const mockClient = require('../_mock_http_client');

function resetAgent(cb) {
  agent._apmClient = mockClient(3, cb);
}

tape.test('span url contains single url', function (t) {
  resetAgent(function (results) {
    t.equals(results.spans.length, 1, 'one span');

    const span = results.spans.pop();
    const url = span.context.http.url;

    // ensure url is not in the form
    // http://127.0.0.1:59281http://127.0.0.1/foo
    t.equals(url, 'http://127.0.0.1/foo', 'records single url only');
    t.end();
  });
  const server = http.createServer(function (req, res) {
    res.end('hello');
  });
  server.unref();
  server.listen(0, '0.0.0.0', () => {
    const port = server.address().port;
    agent.startTransaction();
    const opts = {
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: 'http://127.0.0.1/foo',
    };
    const client = http.request(opts);
    client.end();
    agent.endTransaction();
  });
});
