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

process.env.ELASTIC_APM_TEST = true;
var host = (process.env.ES_HOST || 'localhost') + ':9200';

var agent = require('../../..').start({
  serviceName: 'test-elasticsearch-legacy-client',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  spanCompressionEnabled: false,
});

var elasticsearch = require('elasticsearch');
var pkg = require('elasticsearch/package.json');
var semver = require('semver');
var test = require('tape');

var mockClient = require('../../_mock_http_client');
var findObjInArray = require('../../_utils').findObjInArray;

test('client.ping with callback', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));

  agent.startTransaction('foo');

  var client = new elasticsearch.Client({ host });

  client.ping(function (err) {
    t.error(err, 'no error from client.ping');
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client.ping with promise', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));

  agent.startTransaction('foo');

  var client = new elasticsearch.Client({ host });

  client.ping().then(
    function () {
      agent.endTransaction();
      agent.flush();
    },
    function (err) {
      t.error(err);
    },
  );
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client.search with callback', function userLandCode(t) {
  resetAgent(
    assertApmDataAndEnd(t, 'POST /_search', `http://${host}/_search?q=pants`),
  );

  agent.startTransaction('foo');

  var client = new elasticsearch.Client({ host });
  var query = { q: 'pants' };

  client.search(query, function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client.search with abort', function userLandCode(t) {
  resetAgent(
    assertApmDataAndEnd(t, 'POST /_search', `http://${host}/_search?q=pants`),
  );

  agent.startTransaction('foo');

  var client = new elasticsearch.Client({ host });
  var query = { q: 'pants' };

  var req = client.search(query);
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );

  setImmediate(() => {
    req.abort();
    agent.endTransaction();
    agent.flush();
  });
});

if (semver.satisfies(pkg.version, '>= 10')) {
  test('client.searchTemplate with callback', function userLandCode(t) {
    var body = {
      source: {
        query: {
          query_string: {
            query: '{{q}}',
          },
        },
      },
      params: {
        q: 'pants',
      },
    };

    resetAgent(
      assertApmDataAndEnd(
        t,
        'POST /_search/template',
        `http://${host}/_search/template`,
        JSON.stringify(body),
      ),
    );

    agent.startTransaction('foo');

    var client = new elasticsearch.Client({ host });

    client.searchTemplate({ body }, function (err) {
      t.error(err);
      agent.endTransaction();
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after elasticsearch client command',
    );
  });
}

if (semver.satisfies(pkg.version, '>= 13')) {
  test('client.msearch with callback', function userLandCode(t) {
    var body = [
      {},
      {
        query: {
          query_string: {
            query: 'pants',
          },
        },
      },
    ];

    var statement = body.map(JSON.stringify).join('\n') + '\n';

    resetAgent(
      assertApmDataAndEnd(
        t,
        'POST /_msearch',
        `http://${host}/_msearch`,
        statement,
      ),
    );

    agent.startTransaction('foo');

    var client = new elasticsearch.Client({ host });

    client.msearch({ body }, function (err) {
      t.error(err);
      agent.endTransaction();
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after elasticsearch client command',
    );
  });

  test('client.msearchTempate with callback', function userLandCode(t) {
    var body = [
      {},
      {
        source: {
          query: {
            query_string: {
              query: '{{q}}',
            },
          },
        },
        params: {
          q: 'pants',
        },
      },
    ];

    var statement = body.map(JSON.stringify).join('\n') + '\n';

    resetAgent(
      assertApmDataAndEnd(
        t,
        'POST /_msearch/template',
        `http://${host}/_msearch/template`,
        statement,
      ),
    );

    agent.startTransaction('foo');

    var client = new elasticsearch.Client({ host });

    client.msearchTemplate({ body }, function (err) {
      t.error(err);
      agent.endTransaction();
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after elasticsearch client command',
    );
  });
}

test('client.count with callback', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'POST /_count', `http://${host}/_count`));

  agent.startTransaction('foo');

  var client = new elasticsearch.Client({ host });
  client.count(function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client with host=<array of host:port>', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));
  agent.startTransaction('foo');
  var client = new elasticsearch.Client({ host: [host] });
  client.ping(function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client with hosts=<array of host:port>', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));
  agent.startTransaction('foo');
  var client = new elasticsearch.Client({ hosts: [host, host] });
  client.ping(function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client with hosts="http://host:port"', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));
  agent.startTransaction('foo');
  let hostWithProto = host;
  if (!hostWithProto.startsWith('http')) {
    hostWithProto = 'http://' + host;
  }
  var client = new elasticsearch.Client({ hosts: hostWithProto });
  client.ping(function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

test('client with host=<array of object>', function userLandCode(t) {
  resetAgent(assertApmDataAndEnd(t, 'HEAD /', `http://${host}/`));
  agent.startTransaction('foo');
  const [hostname, port] = host.split(':');
  var client = new elasticsearch.Client({
    host: [{ host: hostname, port }],
  });
  client.ping(function (err) {
    t.error(err);
    agent.endTransaction();
    agent.flush();
  });
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after elasticsearch client command',
  );
});

function assertApmDataAndEnd(
  t,
  expectedName,
  expectedHttpUrl,
  expectedDbStatement,
) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1, 'should have 1 transaction');
    t.strictEqual(data.spans.length, 1, 'should have 1 span');

    var trans = data.transactions[0];

    t.strictEqual(trans.name, 'foo', 'transaction name should be "foo"');
    t.strictEqual(trans.type, 'custom', 'transaction type should be "custom"');

    const type = 'db';
    const subtype = 'elasticsearch';
    const action = 'request';
    const span = findObjInArray(data.spans, 'subtype', subtype);
    t.ok(span, 'should have span with subtype ' + subtype);
    t.strictEqual(span.type, type);
    t.strictEqual(span.subtype, subtype);
    t.strictEqual(span.action, action);

    t.strictEqual(span.name, 'Elasticsearch: ' + expectedName);

    t.ok(
      span.stacktrace.some(function (frame) {
        return frame.function === 'userLandCode';
      }),
      'include user-land code frame',
    );

    if (expectedDbStatement) {
      t.deepEqual(
        span.context.db,
        { type: 'elasticsearch', statement: expectedDbStatement },
        'span.context.db',
      );
    } else {
      t.deepEqual(
        span.context.db,
        { type: 'elasticsearch' },
        'span.context.db',
      );
    }

    if (expectedHttpUrl) {
      t.equal(span.context.http.url, expectedHttpUrl, 'span.context.http.url');
    } else {
      t.notOk(
        span.context.http && span.context.http.url,
        'should not have span.context.http.url',
      );
    }

    t.deepEqual(
      span.context.service.target,
      { type: 'elasticsearch' },
      'span.context.service.target',
    );

    const [address, port] = host.split(':');
    t.deepEqual(
      span.context.destination,
      {
        address,
        port: Number(port),
        service: { type: '', name: '', resource: 'elasticsearch' },
      },
      'span.context.destination',
    );

    t.end();
  };
}

function resetAgent(expected, cb) {
  if (typeof expected === 'function') {
    cb = expected;
    expected = 2;
  }
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(expected, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
