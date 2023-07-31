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
const agent = require('../../../..').start({
  serviceName: 'test-elasticsearch',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  spanCompressionEnabled: false,
});

const { URL } = require('url');

const { CONTEXT_MANAGER_PATCH } = require('../../../../lib/config/schema');
const { safeGetPackageVersion } = require('../../../_utils');

// Support running these tests with a different package name -- typically
// the '@elastic/elasticsearch-canary' package that is sometimes used for
// experimental pre-releases.
const esClientPkgName =
  process.env.ELASTIC_APM_TEST_ESCLIENT_PACKAGE_NAME ||
  '@elastic/elasticsearch';

// Skip (exit the process) if this package version doesn't support this version
// of node.
const esVersion = safeGetPackageVersion(esClientPkgName);
const semver = require('semver');
if (
  (semver.lt(process.version, '10.0.0') && semver.gte(esVersion, '7.12.0')) ||
  (semver.lt(process.version, '12.0.0') &&
    semver.satisfies(esVersion, '>=8', { includePrerelease: true })) ||
  // Surprise: Cannot use ">=8.2.0" here because the ES client uses prerelease
  // tags, e.g. "8.2.0-patch.1", to mean "a patch release after 8.2.0" because
  // it has rules about its version numbers. However semver orders that
  // "-patch.1" *before* "8.2.0".
  (semver.lt(process.version, '14.0.0') &&
    semver.satisfies(esVersion, '>=8.2', { includePrerelease: true }))
) {
  console.log(
    `# SKIP ${esClientPkgName}@${esVersion} does not support node ${process.version}`,
  );
  process.exit();
}

// Silence deprecation warning from @elastic/elasticsearch when using a Node.js
// version that is *soon* to be EOL'd, but isn't yet.
process.noDeprecation = true;
const es = require(esClientPkgName);

const { Readable } = require('stream');
const test = require('tape');
const { TraceParent } = require('../../../../lib/tracecontext/traceparent');

const findObjInArray = require('../../../_utils').findObjInArray;
const mockClient = require('../../../_mock_http_client');
const shimmer = require('../../../../lib/instrumentation/shimmer');
const { MockES } = require('./_mock_es');

let haveDiagCh = false;
try {
  require('diagnostics_channel');
  haveDiagCh = true;
} catch (_noModErr) {
  // pass
}

const port = 9200;
const host = `${process.env.ES_HOST || 'localhost'}:${port}`;
const clientOpts = {
  node: 'http://' + host,
};

test('client.ping with promise', function (t) {
  resetAgent(checkDataAndEnd(t, 'HEAD /', `http://${host}/`, 200));

  agent.startTransaction('myTrans');

  const client = new es.Client(clientOpts);
  client
    .ping()
    .then(function () {
      agent.endTransaction();
      agent.flush();
    })
    .catch(t.error);
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after @elastic/elasticsearch client command',
  );
});

// Callback-style was dropped in ES client v8.
if (!semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
  test('client.ping with callback', function (t) {
    resetAgent(checkDataAndEnd(t, 'HEAD /', `http://${host}/`, 200));

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client.ping(function (err, _result) {
      t.error(err);
      agent.endTransaction();
      agent.flush();
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });
}

test('client.search with promise', function (t) {
  const searchOpts = { q: 'pants' };

  resetAgent(
    checkDataAndEnd(t, 'GET /_search', `http://${host}/_search?q=pants`, 200),
  );

  agent.startTransaction('myTrans');

  const client = new es.Client(clientOpts);
  client
    .search(searchOpts)
    .then(function () {
      agent.endTransaction();
      agent.flush();
    })
    .catch(t.error);
  t.ok(
    agent.currentSpan === null,
    'no currentSpan in sync code after @elastic/elasticsearch client command',
  );
});

// Tests below this point use `<promise>.finally(...)` for test control.
// `.finally` does not exist in node 8 and earlier. Skip those tests.
if (semver.gte(process.version, '10.0.0')) {
  test('client.child', function (t) {
    const searchOpts = { q: 'pants' };

    resetAgent(
      checkDataAndEnd(t, 'GET /_search', `http://${host}/_search?q=pants`, 200),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    const child = client.child({
      headers: { 'x-foo': 'bar' },
    });
    child
      .search(searchOpts)
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('client.search with queryparam', function (t) {
    const searchOpts = { q: 'pants' };

    resetAgent(
      checkDataAndEnd(t, 'GET /_search', `http://${host}/_search?q=pants`, 200),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .search(searchOpts)
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('client.search with body', function (t) {
    const body = {
      query: {
        match: {
          request: 'bar',
        },
      },
    };
    const searchOpts = {
      index: 'myIndex*',
      body,
    };

    resetAgent(
      checkDataAndEnd(
        t,
        `POST /${searchOpts.index}/_search`,
        `http://${host}/${searchOpts.index}/_search`,
        200,
        JSON.stringify(body),
      ),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .search(searchOpts)
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  // ES client version 8 no longer requires body fields to be in a "body" param.
  if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
    test('client.search with query as top-level param (v8)', function (t) {
      const searchOpts = {
        index: 'myIndex*',
        query: {
          match: {
            request: 'bar',
          },
        },
      };

      let expectedDbStatement = Object.assign({}, searchOpts);
      delete expectedDbStatement.index;
      expectedDbStatement = JSON.stringify(expectedDbStatement);
      resetAgent(
        checkDataAndEnd(
          t,
          `POST /${searchOpts.index}/_search`,
          `http://${host}/${searchOpts.index}/_search`,
          200,
          expectedDbStatement,
        ),
      );

      agent.startTransaction('myTrans');

      const client = new es.Client(clientOpts);
      client
        .search(searchOpts)
        .catch((err) => {
          t.error(err);
        })
        .finally(() => {
          agent.endTransaction();
          agent.flush();
        });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after @elastic/elasticsearch client command',
      );
    });
  }

  // Test `span.context.db.statement` format when the client request includes
  // both a body *and* queryparam.
  test('client.search with body & queryparams', function (t) {
    const body = {
      query: {
        match: {
          request: 'bar',
        },
      },
    };
    const searchOpts = {
      index: 'myIndex*',
      body,
      size: 2,
      sort: 'myField:asc',
    };
    let query, statement;
    // ES client version 8 merges options into `body` differently from earlier
    // versions.
    if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
      query = 'sort=myField%3Aasc';
      statement = '{"query":{"match":{"request":"bar"}},"size":2}';
    } else {
      query = 'size=2&sort=myField%3Aasc';
      statement = JSON.stringify(body);
    }

    resetAgent(
      checkDataAndEnd(
        t,
        `POST /${searchOpts.index}/_search`,
        `http://${host}/${searchOpts.index}/_search?${query}`,
        200,
        statement,
      ),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .search(searchOpts)
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('client.searchTemplate', function (t) {
    const body = {
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
      checkDataAndEnd(
        t,
        'POST /_search/template',
        `http://${host}/_search/template`,
        200,
        JSON.stringify(body),
      ),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .searchTemplate({ body })
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('client.msearch', function (t) {
    const body = [
      {},
      {
        query: {
          query_string: {
            query: 'pants',
          },
        },
      },
    ];
    const searchOpts = {
      search_type: 'query_then_fetch',
      typed_keys: false,
      body,
    };
    const query = 'search_type=query_then_fetch&typed_keys=false';
    const statement = body.map(JSON.stringify).join('\n') + '\n';

    resetAgent(
      checkDataAndEnd(
        t,
        'POST /_msearch',
        `http://${host}/_msearch?${query}`,
        200,
        statement,
      ),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .msearch(searchOpts)
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('client.msearchTempate', function (t) {
    const body = [
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
    const statement = body.map(JSON.stringify).join('\n') + '\n';

    resetAgent(
      checkDataAndEnd(
        t,
        'POST /_msearch/template',
        `http://${host}/_msearch/template`,
        200,
        statement,
      ),
    );

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .msearchTemplate({ body })
      .catch((err) => {
        t.error(err);
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  // Test the determination of the Elasticsearch cluster name from the
  // "x-found-handling-cluster" header included in Elastic Cloud.  (Only test
  // with client versions >=8 to avoid the product-check complications in 7.x
  // clients. Also cannot test with contextManager="patch", because of the
  // limitation described in "modules/@elastic/elasticsearch.js".)
  if (
    semver.satisfies(esVersion, '>=8') &&
    agent._conf.contextManager !== CONTEXT_MANAGER_PATCH
  ) {
    test('cluster name from "x-found-handling-cluster"', function (t) {
      // Create a mock Elasticsearch server that mimics a search response from
      // a cloud instance.
      const esServer = new MockES({
        responses: [
          {
            statusCode: 200,
            headers: {
              'content-length': '162',
              'content-type': 'application/json',
              'x-cloud-request-id': 'quf1Yfx0SyOSIytmwkYMrw',
              'x-elastic-product': 'Elasticsearch',
              'x-found-handling-cluster': 'eb2cefb2bb97bb0e9179d92f79eceb1b',
              'x-found-handling-instance': 'instance-0000000000',
              date: 'Wed, 07 Sep 2022 16:32:45 GMT',
            },
            body: '{"took":5,"timed_out":false,"_shards":{"total":25,"successful":25,"skipped":0,"failed":0},"hits":{"total":{"value":0,"relation":"eq"},"max_score":null,"hits":[]}}',
          },
        ],
      });
      esServer.start(function (esUrl) {
        resetAgent(function done(data) {
          // Drop the transaction captured for the request received by the
          // mock ES server, so we can use `checkDataAndEnd()`.
          data.transactions.shift();
          checkDataAndEnd(
            t,
            'GET /_search',
            `${esUrl}/_search?q=pants`,
            200,
            null,
            'eb2cefb2bb97bb0e9179d92f79eceb1b',
          )(data);
        });

        agent.startTransaction('myTrans');
        const client = new es.Client(
          Object.assign({}, clientOpts, { node: esUrl }),
        );
        client
          .search({ q: 'pants' })
          .catch((err) => {
            t.fail('should not have gotten here');
            t.error(err);
          })
          .finally(() => {
            agent.endTransaction();
            agent.flush();
            client.close();
            esServer.close();
          });
      });
    });
  }

  // Test some error scenarios.

  // 'ResponseError' is the client's way of passing back an Elasticsearch API
  // error. Some interesting parts of that error response body should be
  // included in `err.context.custom` and `err.exception.type`.
  test('ResponseError', function (t) {
    resetAgent(function done(data) {
      const err = data.errors[0];
      t.ok(err, 'sent an error to APM server');
      t.ok(err.id, 'err.id');
      t.ok(err.exception.message, 'err.exception.message');
      if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
        t.equal(
          err.exception.type,
          'ResponseError (number_format_exception)',
          'err.exception.type',
        );
      } else {
        t.equal(
          err.exception.type,
          'ResponseError (illegal_argument_exception)',
          'err.exception.type',
        );
      }
      if (semver.satisfies(esVersion, '>=8', { includePrerelease: true })) {
        t.equal(err.exception.module, '@elastic/transport');
        t.deepEqual(err.context.custom, {
          type: 'number_format_exception',
          reason: 'For input string: "surprise_me"',
          status: 400,
        });
      } else {
        t.equal(err.exception.module, esClientPkgName);
        t.deepEqual(err.context.custom, {
          type: 'illegal_argument_exception',
          reason:
            'Failed to parse int parameter [size] with value [surprise_me]',
          caused_by: {
            type: 'number_format_exception',
            reason: 'For input string: "surprise_me"',
          },
          status: 400,
        });
      }
      t.end();
    });

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);

    client
      .search({ size: 'surprise_me', q: 'pants' })
      .then(() => {
        t.fail('should not have gotten here, should have errored instead');
      })
      .catch((err) => {
        t.ok(err, 'got an error from search callback');
        t.equal(err.name, 'ResponseError', 'error name is "ResponseError"');
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  if (semver.satisfies(esVersion, '<8', { includePrerelease: true })) {
    // Ensure that `captureError` serialization does *not* include the possibly
    // large `data` field from a deserialization error.
    //
    // Cannot simulate this with ES client version 8, because the
    // `client.transport`'s serializer is hidden behind a Symbol.
    test('DeserializationError', function (t) {
      resetAgent(function done(data) {
        const err = data.errors[0];
        t.ok(err, 'sent an error to APM server');
        t.ok(err.id, 'err.id');
        t.ok(err.exception.message, 'err.exception.message');
        t.equal(
          err.exception.type,
          'DeserializationError',
          'err.exception.type is DeserializationError',
        );
        t.notOk(
          err.exception.attributes && err.exception.attributes.data,
          'captured error should NOT include "data" attribute',
        );
        t.end();
      });

      agent.startTransaction('myTrans');

      const client = new es.Client(clientOpts);

      // To simulate an error we monkey patch the client's Serializer such that
      // deserialization of the response body fails.
      shimmer.wrap(
        client.transport.serializer,
        'deserialize',
        function wrapDeserialize(origDeserialize) {
          return function wrappedDeserialize(json) {
            return origDeserialize.call(
              this,
              json + 'THIS_WILL_BREAK_JSON_DESERIALIZATION',
            );
          };
        },
      );

      client.search({ q: 'pants' }, function (err, _result) {
        t.ok(err, 'got an error from search callback');
        t.equal(
          err.name,
          'DeserializationError',
          'error name is "DeserializationError"',
        );
        agent.endTransaction();
        agent.flush();
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after @elastic/elasticsearch client command',
      );
    });
  }

  if (semver.gte(esVersion, '7.14.0')) {
    test('ProductNotSupportedError', function (t) {
      // Create a mock Elasticsearch server that yields a "GET /" response
      // that triggers ProductNotSupportedError.
      const esServer = new MockES({
        responses: [
          {
            statusCode: 200,
            headers: {
              // This header value triggers ProductNotSupportedError for ES client v8+.
              'X-elastic-product': 'not-Elasticsearch',
              'content-type': 'application/json',
            },
            // This body triggers ProductNotSupportedError for ES client 7.x.
            body: JSON.stringify({ hi: 'there' }),
          },
        ],
      });
      esServer.start(function (esUrl) {
        resetAgent(function done(data) {
          const err = data.errors[0];
          t.ok(err, 'sent an error to APM server');
          t.ok(err.id, 'err.id');
          t.ok(
            err.exception.message,
            'got err.exception.message: ' + err.exception.message,
          );
          t.equal(
            err.exception.type,
            'ProductNotSupportedError',
            'err.exception.type is ProductNotSupportedError',
          );
          t.end();
        });

        agent.startTransaction('myTrans');
        const client = new es.Client(
          Object.assign({}, clientOpts, { node: esUrl }),
        );
        client
          .search({ q: 'pants' })
          .then(() => {
            t.fail('should not have gotten here, should have errored instead');
          })
          .catch((err) => {
            t.ok(err, 'got an error from search callback');
            t.equal(
              err.name,
              'ProductNotSupportedError',
              'error name is "ProductNotSupportedError"',
            );
          })
          .finally(() => {
            agent.endTransaction();
            agent.flush();
            client.close();
            esServer.close();
          });
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in sync code after @elastic/elasticsearch client command',
        );
      });
    });
  }

  if (
    semver.satisfies(esVersion, '>=8', { includePrerelease: true }) &&
    global.AbortController
  ) {
    // Abort handling in ES client version 8 changed to use AbortController.
    // Test that if AbortController is available in this node version.
    test('AbortController signal works', function (t) {
      resetAgent(function done(data) {
        // We expect to get:
        // - 1 elasticsearch span
        // - 1 abort error (and possibly another error due to the double-callback
        //   bug mentioned below)
        const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch');
        t.ok(esSpan, 'have an elasticsearch span');

        const err = data.errors.filter(
          (e) => e.exception.type === 'RequestAbortedError',
        )[0];
        t.ok(err, 'sent an error to APM server');
        t.ok(err.id, 'err.id');
        t.equal(
          err.exception.message,
          'Request aborted',
          'err.exception.message',
        );
        t.equal(
          err.exception.type,
          'RequestAbortedError',
          'err.exception.type is RequestAbortedError',
        );

        t.end();
      });

      agent.startTransaction('myTrans');

      const client = new es.Client(clientOpts);
      // eslint-disable-next-line no-undef
      const ac = new AbortController();
      setImmediate(() => {
        ac.abort();
      });
      client
        .search({ q: 'pants' }, { signal: ac.signal })
        .then(() => {
          t.fail('should not have gotten here, should have errored instead');
        })
        .catch((err) => {
          t.ok(err, 'got an error from search callback');
          t.equal(
            err.name,
            'RequestAbortedError',
            'error name is "RequestAbortedError"',
          );
        })
        .finally(() => {
          agent.endTransaction();
          agent.flush();
          client.close();
        });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after @elastic/elasticsearch client command',
      );
    });
  }

  if (semver.gte(esVersion, '7.7.0') && semver.satisfies(esVersion, '7')) {
    // Abort handling was added to @elastic/elasticsearch@7.7.0 for the 7.x series.

    test('request.abort() works', function (t) {
      resetAgent(function done(data) {
        // We expect to get:
        // - 1 elasticsearch span
        // - 1 abort error (and possibly another error due to the double-callback
        //   bug mentioned below)
        const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch');
        t.ok(esSpan, 'have an elasticsearch span');

        const err = data.errors.filter(
          (e) => e.exception.type === 'RequestAbortedError',
        )[0];
        t.ok(err, 'sent an error to APM server');
        t.ok(err.id, 'err.id');
        t.equal(
          err.exception.message,
          'Request aborted',
          'err.exception.message',
        );
        t.equal(
          err.exception.type,
          'RequestAbortedError',
          'err.exception.type is RequestAbortedError',
        );

        t.end();
      });

      agent.startTransaction('myTrans');

      // Start a request that we expect to *not* succeed quickly (artificially
      // make getting the request body slow via `slowBody`) then abort as soon
      // as possible.
      const slowBody = new Readable({
        read(size) {
          setTimeout(() => {
            this.push('{"query":{"match_all":{}}}');
            this.push(null); // EOF
          }, 1000).unref();
        },
      });
      let gotCallbackAlready = false;
      const client = new es.Client(clientOpts);
      const req = client.search({ body: slowBody }, function (err, _result) {
        // Use gotCallbackAlready to avoid double-callback bug
        // https://github.com/elastic/elasticsearch-js/issues/1374
        if (!gotCallbackAlready) {
          gotCallbackAlready = true;
          t.ok(err, 'got error');
          t.equal(
            err.name,
            'RequestAbortedError',
            'error is RequestAbortedError',
          );
          agent.endTransaction();
          agent.flush();
        }
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after @elastic/elasticsearch client command',
      );
      setImmediate(function () {
        req.abort();
      });
    });

    test('promise.abort() works', function (t) {
      resetAgent(function done(data) {
        // We expect to get:
        // - 1 elasticsearch span
        // - 1 abort error (and possibly another error due to a double-callback
        //   bug https://github.com/elastic/elasticsearch-js/issues/1374)

        const esSpan = findObjInArray(data.spans, 'subtype', 'elasticsearch');
        t.ok(esSpan, 'have an elasticsearch span');

        const err = data.errors.filter(
          (e) => e.exception.type === 'RequestAbortedError',
        )[0];
        t.ok(err, 'sent an error to APM server');
        t.ok(err.id, 'err.id');
        t.ok(err.exception.message, 'err.exception.message');
        t.equal(
          err.exception.type,
          'RequestAbortedError',
          'err.exception.type is RequestAbortedError',
        );

        t.end();
      });

      agent.startTransaction('myTrans');

      // Start a request that we expect to *not* succeed quickly (artificially
      // make getting the request body slow via `slowBody`) then abort as soon
      // as possible.
      const slowBody = new Readable({
        read(size) {
          setTimeout(() => {
            this.push('{"query":{"match_all":{}}}');
            this.push(null); // EOF
          }, 1000).unref();
        },
      });
      const client = new es.Client(clientOpts);
      const promise = client.search({ body: slowBody });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after @elastic/elasticsearch client command',
      );
      promise
        .then((_result) => {})
        .catch((err) => {
          t.ok(err, 'got error');
          t.equal(
            err.name,
            'RequestAbortedError',
            'error is RequestAbortedError',
          );
          agent.endTransaction();
          agent.flush();
        });
      setImmediate(function () {
        promise.abort();
      });
    });
  }

  test('outcome=success on both spans', function (t) {
    resetAgent(checkSpanOutcomesSuccess(t));

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .ping()
      .catch(t.error)
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  test('outcome=failure on both spans', function (t) {
    const searchOpts = { notaparam: 'notthere' };

    resetAgent(checkSpanOutcomesFailures(t));

    agent.startTransaction('myTrans');

    const client = new es.Client(clientOpts);
    client
      .search(searchOpts)
      .catch((err) => {
        t.ok(err, 'got an error from search with bogus "notaparam"');
      })
      .finally(() => {
        agent.endTransaction();
        agent.flush();
      });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after @elastic/elasticsearch client command',
    );
  });

  // Ensure that even without HTTP child spans, trace-context propagation to
  // Elasticsearch still works.
  const clientOptsToTry = {}; // <name> -> <clientOpts object>
  if (!es.HttpConnection) {
    // This is pre-v8 of the ES client. Just test the default client options.
    clientOptsToTry.default = clientOpts;
  } else {
    if (haveDiagCh) {
      clientOptsToTry.UndiciConnection = clientOpts;
    }
    // Also test the ES client configured to use HttpConnection rather than its
    // default UndiciConnection. This is relevant for Kibana that, currently,
    // uses HttpConnection.
    clientOptsToTry.HttpConnection = Object.assign({}, clientOpts, {
      Connection: es.HttpConnection,
    });
  }
  Object.keys(clientOptsToTry).forEach((clientOptsName) => {
    test(`context-propagation works (${clientOptsName} client options)`, function (t) {
      const mockResponses = [
        {
          statusCode: 200,
          headers: {
            'X-elastic-product': 'Elasticsearch',
            'content-type': 'application/json',
          },
          body: '{"took":0,"timed_out":false,"_shards":{"total":0,"successful":0,"skipped":0,"failed":0},"hits":{"total":{"value":0,"relation":"eq"},"max_score":0,"hits":[]}}',
        },
      ];
      if (
        semver.gte(esVersion, '7.14.0') &&
        semver.satisfies(esVersion, '7.x')
      ) {
        // First request will be "GET /" for a product check.
        mockResponses.unshift({
          statusCode: 200,
          headers: {
            'X-elastic-product': 'Elasticsearch',
            'content-type': 'application/json',
          },
          body: '{"name":"645a066f9b52","cluster_name":"docker-cluster","cluster_uuid":"1pR-cy9dSLWO7TNxI3kodA","version":{"number":"8.0.0-beta1","build_flavor":"default","build_type":"docker","build_hash":"ba1f616138a589f12eb0c6f678aee96377525b8f","build_date":"2021-11-04T12:35:26.989068569Z","build_snapshot":false,"lucene_version":"9.0.0","minimum_wire_compatibility_version":"7.16.0","minimum_index_compatibility_version":"7.0.0"},"tagline":"You Know, for Search"}',
        });
      }
      const esServer = new MockES({ responses: mockResponses });
      esServer.start(function (esUrl) {
        resetAgent(function done(data) {
          // Assert that the ES server request for the `client.search()` is as
          // expected.
          const searchSpan = data.spans[data.spans.length - 1];
          const esServerReq = esServer.requests[esServer.requests.length - 1];
          const tracestate = esServerReq.headers.tracestate;
          t.equal(
            tracestate,
            'es=s:1',
            'esServer request included the expected tracestate header',
          );
          t.ok(
            esServerReq.headers.traceparent,
            'esServer request included a traceparent header',
          );
          const traceparent = TraceParent.fromString(
            esServerReq.headers.traceparent,
          );
          t.equal(traceparent.traceId, myTrans.traceId, 'traceparent.traceId');
          // node-traceparent erroneously (IMHO) calls this field `id` instead
          // of `parentId`.
          t.equal(traceparent.id, searchSpan.id, 'traceparent.id');
          t.end();
        });

        const myTrans = agent.startTransaction('myTrans');
        const client = new es.Client(
          Object.assign({}, clientOptsToTry[clientOptsName], { node: esUrl }),
        );
        client
          .search({ q: 'pants' })
          .then(() => {
            t.ok('client.search succeeded');
          })
          .catch((err) => {
            t.error(err, 'no error from client.search');
          })
          .finally(() => {
            myTrans.end();
            agent.flush();
            client.close();
            esServer.close();
          });
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in sync code after @elastic/elasticsearch client command',
        );
      });
    });
  });
}

// Utility functions.

function checkSpanOutcomesFailures(t) {
  return function (data) {
    data.spans.sort((a, b) => {
      return a.timestamp < b.timestamp ? -1 : 1;
    });
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      // Remove the product check spans for subsequent assertions.
      data.spans = data.spans.slice(0, 1).concat(data.spans.slice(3));
    }

    for (const span of data.spans) {
      t.equals(span.outcome, 'failure', 'spans outcomes are failure');
    }
    t.end();
  };
}

function checkSpanOutcomesSuccess(t) {
  return function (data) {
    data.spans.sort((a, b) => {
      return a.timestamp < b.timestamp ? -1 : 1;
    });
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      // Remove the product check spans for subsequent assertions.
      data.spans = data.spans.slice(0, 1).concat(data.spans.slice(3));
    }

    for (const span of data.spans) {
      t.equals(span.outcome, 'success', 'spans outcomes are success');
    }
    t.end();
  };
}

function checkDataAndEnd(
  t,
  expectedName,
  expectedHttpUrl,
  expectedStatusCode,
  expectedDbStatement,
  expectedClusterName,
) {
  return function (data) {
    t.equal(data.transactions.length, 1, 'should have 1 transaction');
    const trans = data.transactions[0];
    t.equal(trans.name, 'myTrans', 'should have expected transaction name');
    t.equal(trans.type, 'custom', 'should have expected transaction type');

    // As of @elastic/elasticsearch@7.14.0 and only for the 7.x series,
    // the first request from an ES Client will be preceded by a preflight
    // "GET /" product check.
    data.spans.sort((a, b) => {
      return a.timestamp < b.timestamp ? -1 : 1;
    });
    if (semver.gte(esVersion, '7.14.0') && semver.satisfies(esVersion, '7.x')) {
      const prodCheckEsSpan = data.spans[1];
      t.ok(prodCheckEsSpan, 'have >=7.14.0 product check ES span');
      t.equal(
        prodCheckEsSpan.name,
        'Elasticsearch: GET /',
        'product check ES span name',
      );
      // Remove the product check span for subsequent assertions.
      data.spans = data.spans.slice(0, 1);
    }

    t.equal(
      data.spans.length,
      1,
      'should have 1 span (excluding product check spans in >=7.14.0)',
    );
    const esSpan = data.spans[0];
    t.ok(esSpan, 'have an elasticsearch span');
    t.strictEqual(esSpan.type, 'db');
    t.strictEqual(esSpan.subtype, 'elasticsearch');
    t.strictEqual(esSpan.action, 'request');
    t.strictEqual(esSpan.sync, false, 'span.sync=false');
    t.equal(
      esSpan.name,
      'Elasticsearch: ' + expectedName,
      'elasticsearch span should have expected name',
    );

    const expectedDb = { type: 'elasticsearch' };
    if (expectedDbStatement) {
      expectedDb.statement = expectedDbStatement;
    }
    if (expectedClusterName) {
      expectedDb.instance = expectedClusterName;
    }
    t.deepEqual(esSpan.context.db, expectedDb, 'span.context.db');

    const expectedServiceTarget = { type: 'elasticsearch' };
    if (expectedClusterName) {
      expectedServiceTarget.name = expectedClusterName;
    }
    t.deepEqual(
      esSpan.context.service.target,
      expectedServiceTarget,
      'span.context.service.target',
    );

    const expectedDestination = {
      address: host.split(':')[0],
      port,
      service: { type: '', name: '', resource: 'elasticsearch' },
    };
    if (expectedHttpUrl) {
      const parsed = new URL(expectedHttpUrl);
      expectedDestination.address = parsed.hostname;
      expectedDestination.port = Number(parsed.port);
    }
    if (expectedClusterName) {
      expectedDestination.service.resource += '/' + expectedClusterName;
    }
    t.deepEqual(
      esSpan.context.destination,
      expectedDestination,
      'span.context.destination',
    );

    if (expectedHttpUrl) {
      t.equal(
        esSpan.context.http.url,
        expectedHttpUrl,
        'span.context.http.url',
      );
    } else {
      t.notOk(
        esSpan.context.http && esSpan.context.http.url,
        'should not have span.context.http.url',
      );
    }

    // With @elastic/elasticsearch >=8 and `contextManager="patch"` there is
    // a limitation such that some HTTP context fields cannot be captured.
    // (See "Limitations" section in the instrumentation code.)
    if (
      semver.satisfies(esVersion, '>=8', { includePrerelease: true }) &&
      agent._conf.contextManager === CONTEXT_MANAGER_PATCH
    ) {
      t.comment(
        'skip span.context.http.{status_code,response} check because of contextManager="patch" + esVersion>=8 limitation',
      );
    } else {
      t.equal(
        esSpan.context.http.status_code,
        expectedStatusCode,
        'context.http.status_code',
      );
      t.ok(
        esSpan.context.http.response.encoded_body_size,
        'context.http.response.encoded_body_size is present',
      );
    }

    t.end();
  };
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
}
