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

var agent = require('../../../..').start({
  serviceName: 'test-pg',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false,
});

var semver = require('semver');
var once = require('once');
var pgVersion = require('pg/package.json').version;

var test = require('tape');
var pg = require('pg');
var utils = require('./_utils');
var mockClient = require('../../../_mock_http_client');
const { NoopApmClient } = require('../../../../lib/apm-client/noop-apm-client');
const {
  findObjInArray,
  runTestFixtures,
  sortApmEvents,
} = require('../../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

var queryable, connectionDone;
var factories = [
  [createClient, 'client'],
  [createPoolAndConnect, 'pool'],
];

factories.forEach(function (f) {
  var factory = f[0];
  var type = f[1];

  test('pg.' + factory.name, function (t) {
    t.on('end', teardown);
    t.test('basic query with callback', function (t) {
      t.test(type + '.query(sql, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query(sql, basicQueryCallback(t));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
        });
      });

      t.test(type + '.query(sql, values, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query(sql, [1], basicQueryCallback(t));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
        });
      });

      t.test(type + '.query(options, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query({ text: sql }, basicQueryCallback(t));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
        });
      });

      t.test(type + '.query(options, values, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query({ text: sql }, [1], basicQueryCallback(t));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
        });
      });

      t.test(type + '.query(options-with-values, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query({ text: sql, values: [1] }, basicQueryCallback(t));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
        });
      });

      t.test(type + '.query(sql) - no callback', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          var trans = agent.startTransaction('foo');
          queryable.query(sql);
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          setTimeout(function () {
            trans.end();
          }, 250);
        });
      });

      t.end();
    });

    t.test('basic query streaming', function (t) {
      t.test(type + '.query(new Query(sql))', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query(new pg.Query(sql));
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      if (semver.gte(pgVersion, '7.0.0')) return;

      t.test(type + '.query(sql)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query(sql);
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(sql, values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query(sql, [1]);
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(options)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query({ text: sql });
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(options, values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query({ text: sql }, [1]);
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(options-with-values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + $1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query({ text: sql, values: [1] });
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after pg .query',
          );
          basicQueryStream(stream, t);
        });
      });

      t.end();
    });

    if (semver.gte(pgVersion, '5.1.0')) {
      t.test('basic query promise', function (t) {
        t.test(type + '.query(sql)', function (t) {
          resetAgent(function (data) {
            assertBasicQuery(t, sql, data);
            t.end();
          });
          var sql = 'SELECT 1 + 1 AS solution';
          factory(function () {
            agent.startTransaction('foo');
            var p = queryable.query(sql);
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in sync code after pg .query',
            );
            basicQueryPromise(p, t);
          });
        });

        t.test(type + '.query(sql, values)', function (t) {
          resetAgent(function (data) {
            assertBasicQuery(t, sql, data);
            t.end();
          });
          var sql = 'SELECT 1 + $1 AS solution';
          factory(function () {
            agent.startTransaction('foo');
            var p = queryable.query(sql, [1]);
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in sync code after pg .query',
            );
            basicQueryPromise(p, t);
          });
        });

        t.test(type + '.query(options)', function (t) {
          resetAgent(function (data) {
            assertBasicQuery(t, sql, data);
            t.end();
          });
          var sql = 'SELECT 1 + 1 AS solution';
          factory(function () {
            agent.startTransaction('foo');
            var p = queryable.query({ text: sql });
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in sync code after pg .query',
            );
            basicQueryPromise(p, t);
          });
        });

        t.test(type + '.query(options, values)', function (t) {
          resetAgent(function (data) {
            assertBasicQuery(t, sql, data);
            t.end();
          });
          var sql = 'SELECT 1 + $1 AS solution';
          factory(function () {
            agent.startTransaction('foo');
            var p = queryable.query({ text: sql }, [1]);
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in sync code after pg .query',
            );
            basicQueryPromise(p, t);
          });
        });

        t.test(type + '.query(options-with-values)', function (t) {
          resetAgent(function (data) {
            assertBasicQuery(t, sql, data);
            t.end();
          });
          var sql = 'SELECT 1 + $1 AS solution';
          factory(function () {
            agent.startTransaction('foo');
            var p = queryable.query({ text: sql, values: [1] });
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in sync code after pg .query',
            );
            basicQueryPromise(p, t);
          });
        });
      });
    }

    t.test('simultaneous queries', function (t) {
      t.test('on same connection', function (t) {
        resetAgent(4, function (data) {
          t.strictEqual(data.transactions.length, 1);
          t.strictEqual(data.spans.length, 3);

          var trans = data.transactions[0];

          t.strictEqual(trans.name, 'foo');
          data.spans.forEach(function (span) {
            assertSpan(t, span, sql);
            t.equal(
              span.parent_id,
              trans.id,
              'each span is a child of the transaction',
            );
          });

          t.end();
        });

        var sql = 'SELECT 1 + $1 AS solution';

        factory(function () {
          var n = 0;
          var trans = agent.startTransaction('foo');

          queryable.query(sql, [1], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 2);
            if (++n === 3) done();
          });
          queryable.query(sql, [2], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 3);
            if (++n === 3) done();
          });
          queryable.query(sql, [3], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 4);
            if (++n === 3) done();
          });

          function done() {
            trans.end();
          }
        });
      });
    });

    t.test('simultaneous transactions', function (t) {
      resetAgent(6, function (data) {
        t.strictEqual(data.transactions.length, 3);
        t.strictEqual(data.spans.length, 3);
        var names = data.transactions
          .map(function (trans) {
            return trans.name;
          })
          .sort();
        t.deepEqual(names, ['bar', 'baz', 'foo']);

        data.transactions.forEach(function (trans) {
          const span = findObjInArray(data.spans, 'transaction_id', trans.id);
          t.ok(span, 'transaction should have span');
          assertSpan(t, span, sql);
          t.equal(
            span.parent_id,
            trans.id,
            'the span is a child of the transaction',
          );
        });

        t.end();
      });

      var sql = 'SELECT 1 + $1 AS solution';

      factory(function () {
        setImmediate(function () {
          var trans = agent.startTransaction('foo');
          queryable.query(sql, [1], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 2);
            trans.end();
          });
        });

        setImmediate(function () {
          var trans = agent.startTransaction('bar');
          queryable.query(sql, [2], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 3);
            trans.end();
          });
        });

        setImmediate(function () {
          var trans = agent.startTransaction('baz');
          queryable.query(sql, [3], function (err, result, fields) {
            t.error(err);
            t.strictEqual(result.rows[0].solution, 4);
            trans.end();
          });
        });
      });
    });
  });
});

test('simultaneous queries on different connections', function (t) {
  t.on('end', teardown);
  resetAgent(4, function (data) {
    t.strictEqual(data.transactions.length, 1);
    t.strictEqual(data.spans.length, 3);

    var trans = data.transactions[0];

    t.strictEqual(trans.name, 'foo');
    data.spans.forEach(function (span) {
      assertSpan(t, span, sql);
      t.equal(
        span.parent_id,
        trans.id,
        'each span is a child of the transaction',
      );
    });

    t.end();
  });

  var sql = 'SELECT 1 + $1 AS solution';

  createPool(function (connector) {
    var n = 0;
    var trans = agent.startTransaction('foo');

    connector(function (err, client, release) {
      t.error(err);
      client.query(sql, [1], function (err, result, fields) {
        t.error(err);
        t.strictEqual(result.rows[0].solution, 2);
        if (++n === 3) done();
        release();
      });
    });
    connector(function (err, client, release) {
      t.error(err);
      client.query(sql, [2], function (err, result, fields) {
        t.error(err);
        t.strictEqual(result.rows[0].solution, 3);
        if (++n === 3) done();
        release();
      });
    });
    connector(function (err, client, release) {
      t.error(err);
      client.query(sql, [3], function (err, result, fields) {
        t.error(err);
        t.strictEqual(result.rows[0].solution, 4);
        if (++n === 3) done();
        release();
      });
    });

    function done() {
      trans.end();
    }
  });
});

test('connection.release()', function (t) {
  t.on('end', teardown);
  resetAgent(function (data) {
    assertBasicQuery(t, sql, data);
    t.end();
  });

  var sql = 'SELECT 1 + 1 AS solution';

  createPool(function (connector) {
    agent.startTransaction('foo');

    connector(function (err, client, release) {
      t.error(err);
      release();

      connector(function (err, client, release) {
        t.error(err);
        client.query(sql, basicQueryCallback(t));
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in sync code after pg .query',
        );

        if (semver.gte(pgVersion, '7.5.0')) {
          release();
        } else {
          // Race-condition: Wait a bit so the query callback isn't called
          // with a "Connection terminated by user" error
          setTimeout(release, 100);
        }
      });
    });
  });
});

// The same guard logic as from the instrumentation module
//
// https://github.com/elastic/apm-agent-nodejs/blob/8a5e908b8e9ee83bb1b828a3bef980388ea6e08e/lib/instrumentation/modules/pg.js#L91
//
// ensures this tests runs when ending a span via promise.then
if (
  typeof pg.Client.prototype.query.on !== 'function' &&
  typeof pg.Client.prototype.query.then === 'function'
) {
  test.test('handles promise rejections from pg', function (t) {
    function unhandledRejection(e) {
      t.fail('had unhandledRejection');
    }
    process.once('unhandledRejection', unhandledRejection);
    t.on('end', function () {
      process.removeListener('unhandledRejection', unhandledRejection);
      teardown();
    });

    var sql =
      "select 'not-a-uuid' = '00000000-0000-0000-0000-000000000000'::uuid";

    createPool(function (connector) {
      agent.startTransaction('foo');

      connector(function (err, client, release) {
        t.error(err);

        client
          .query(sql)
          .then(function () {
            t.fail('query should have rejected');
          })
          .catch(function () {
            t.ok(
              agent.currentSpan === null,
              'no currentSpan in promise catch after pg .query',
            );
          })
          .then(function () {
            setTimeout(function () {
              release();
              t.end();
            }, 100);
          });
      });
    });
  });
}

function basicQueryCallback(t) {
  return function queryCallback(err, result, fields) {
    t.ok(agent.currentSpan === null, 'no currentSpan in pg .query callback');
    t.error(err);
    t.strictEqual(result.rows[0].solution, 2);
    agent.endTransaction();
  };
}

function basicQueryStream(stream, t) {
  var results = 0;
  stream.on('error', function (err) {
    t.ok(
      agent.currentSpan === null,
      'pg span should not be active in user code',
    );
    t.error(err);
  });
  stream.on('row', function (row) {
    t.ok(
      agent.currentSpan === null,
      'pg span should not be active in user code',
    );
    results++;
    t.strictEqual(row.solution, 2);
  });
  stream.on('end', function () {
    t.ok(
      agent.currentSpan === null,
      'pg span should not be active in user code',
    );
    t.strictEqual(results, 1);
    agent.endTransaction();
  });
}

function basicQueryPromise(p, t) {
  p.catch(function (err) {
    t.error(err);
  });
  p.then(function (results) {
    t.strictEqual(results.rows.length, 1);
    t.strictEqual(results.rows[0].solution, 2);
    agent.endTransaction();
  });
}

function assertBasicQuery(t, sql, data) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 1);

  var trans = data.transactions[0];
  t.strictEqual(trans.name, 'foo');

  var span = data.spans[0];
  assertSpan(t, span, sql);
}

function assertSpan(t, span, sql) {
  t.strictEqual(span.name, 'SELECT');
  t.strictEqual(span.type, 'db');
  t.strictEqual(span.subtype, 'postgresql');
  t.strictEqual(span.action, 'query');
  t.deepEqual(
    span.context.db,
    {
      type: 'sql',
      statement: sql,
      instance: 'test_elastic_apm',
      user: process.env.PGUSER || 'postgres',
    },
    'span.context.db',
  );
  t.deepEqual(
    span.context.service.target,
    { type: 'postgresql', name: 'test_elastic_apm' },
    'span.context.service.target',
  );
  t.deepEqual(
    span.context.destination,
    {
      address: process.env.PGHOST || 'localhost',
      port: 5432,
      service: { type: '', name: '', resource: 'postgresql/test_elastic_apm' },
    },
    'span.context.destination',
  );
}

function createClient(cb) {
  setup(function () {
    queryable = new pg.Client({
      database: 'test_elastic_apm',
      user: process.env.PGUSER || 'postgres',
    });
    queryable.connect(function (err) {
      if (err) throw err;
      cb();
    });
  });
}

function createPool(cb) {
  setup(function () {
    var connector;

    if (semver.satisfies(pgVersion, '<6.0.0')) {
      queryable = pg;
      connector = function connector(cb) {
        return pg.connect(
          {
            database: 'test_elastic_apm',
            user: process.env.PGUSER || 'postgres',
          },
          cb,
        );
      };
    } else {
      var pool = new pg.Pool({
        database: 'test_elastic_apm',
        user: process.env.PGUSER || 'postgres',
      });
      queryable = pool;
      connector = function connector(cb) {
        return pool.connect(cb);
      };
    }

    cb(connector);
  });
}

function createPoolAndConnect(cb) {
  createPool(function (connector) {
    connector(function (err, client, done) {
      if (err) throw err;
      queryable = client;
      connectionDone = done;
      cb();
    });
  });
}

function setup(cb) {
  // just in case it didn't happen at the end of the previous test
  teardown(function () {
    utils.reset(cb);
  });
}

function teardown(cb) {
  cb = once(cb || function () {});

  if (queryable) {
    // this will not work for pools, where we instead rely on the queryable.end
    // callback
    queryable.once('end', cb);

    if (connectionDone && semver.satisfies(pgVersion, '^5.2.1')) {
      // Version 5.2.1 doesn't release the connection back into the pool when
      // calling client.end(), so we'll instead drain the pool completely. This
      // takes a lot longer, so we don't wanna do this normally.
      //
      // For details see:
      // https://github.com/brianc/node-postgres/issues/1414
      connectionDone(true); // true: disconnect and destroy the client
      connectionDone = undefined;
    } else {
      queryable.end(cb);
    }
    queryable = undefined;
  } else {
    process.nextTick(cb);
  }
}

function resetAgent(expected, cb) {
  if (typeof expected === 'function') return resetAgent(2, expected);
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._apmClient.destroy) agent._apmClient.destroy();
  agent._apmClient = mockClient(expected, cb);
  agent._instrumentation.testReset();
}

const testFixtures = [
  {
    // Exercise using `pg` lightly. This still relies on the CommonJS tests
    // for coverage of the instrumentation.
    name: 'pg ESM',
    script: '../fixtures/use-pg.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1',
      ELASTIC_APM_SPAN_COMPRESSION_ENABLED: 'false',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
      // In earlier 'pg' versions the getter for `pg.native` (intended to avoid
      // importing 'pg-native' unless used) would be tickled by the core Node.js
      // ESM translator, resulting in this error:
      //    Cannot find module 'pg-native'
      pg: '>=8',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        4,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      const trans = events[0].transaction;
      t.equal(trans.name, 'trans', 'transaction.name');
      t.equal(trans.type, 'custom', 'transaction.type');
      t.equal(trans.outcome, 'unknown', 'transaction.outcome');

      const spans = events.slice(1, 5).map((e) => e.span);
      const expectedSpanNames = ['SELECT', 'SELECT'];
      spans.forEach((s, idx) => {
        t.equal(s.name, expectedSpanNames[idx], `span[${idx}].name`);
        t.equal(s.type, 'db', `span[${idx}].type`);
        t.equal(s.subtype, 'postgresql', `span[${idx}].action`);
        t.equal(s.action, 'query', `span[${idx}].action`);
        t.equal(s.parent_id, trans.id, `span[${idx}].parent_id`);
        t.deepEqual(
          s.context,
          {
            service: { target: { type: 'postgresql', name: 'postgres' } },
            destination: {
              address: process.env.PGHOST || 'localhost',
              port: 5432,
              service: { type: '', name: '', resource: 'postgresql/postgres' },
            },
            db: {
              type: 'sql',
              statement: 'SELECT $1::text as message',
              instance: 'postgres',
              user: 'postgres',
            },
          },
          `span[${idx}].context`,
        );
      });
    },
  },
];

test('pg fixtures', (suite) => {
  // Undo the `agent._apmClient = ...` from earlier `resetAgent` usage.
  agent._apmClient = new NoopApmClient();

  runTestFixtures(suite, testFixtures);
  suite.end();
});
