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
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false,
});

var mysql = require('mysql');
var mysqlVersion = require('mysql/package.json').version;
var semver = require('semver');
var test = require('tape');

var utils = require('./_utils');
var mockClient = require('../../../_mock_http_client');
var findObjInArray = require('../../../_utils').findObjInArray;

var queryable;
var connectionOptions = utils.credentials();
var factories = [
  [createConnection, 'connection'],
  [createPool, 'pool'],
  [createPoolAndGetConnection, 'pool > connection'],
  [createPoolClusterAndGetConnection, 'poolCluster > connection'],
  [createPoolClusterAndGetConnectionViaOf, 'poolCluster > of > connection'],
];

factories.forEach(function (f) {
  var factory = f[0];
  var type = f[1];

  // Prior to mysql v2.4 pool.query would not return a Query object.
  // See: https://github.com/mysqljs/mysql/pull/830
  var skipStreamTest =
    type === 'pool' && semver.satisfies(mysqlVersion, '<2.4.0');

  // Prior to mysql v2.2 pool.query required a callback.
  // See: https://github.com/mysqljs/mysql/pull/585
  var skipNoCallbackTest =
    type === 'pool' && semver.satisfies(mysqlVersion, '<2.2.0');

  test('mysql.' + factory.name, function (t) {
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
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
        });
      });

      t.test(type + '.query(sql, values, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query(sql, [1], basicQueryCallback(t));
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
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
          queryable.query({ sql }, basicQueryCallback(t));
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
        });
      });

      t.test(type + '.query(options, values, callback)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          queryable.query({ sql }, [1], basicQueryCallback(t));
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
        });
      });

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var query = mysql.createQuery(sql, basicQueryCallback(t));
          queryable.query(query);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
        });
      });

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var query = mysql.createQuery(sql, [1], basicQueryCallback(t));
          queryable.query(query);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
        });
      });

      if (skipNoCallbackTest) return;

      t.test(type + '.query(sql) - no callback', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          var trans = agent.startTransaction('foo');
          queryable.query(sql);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          setTimeout(function () {
            trans.end();
          }, 250);
        });
      });
    });

    if (skipStreamTest) return;

    t.test('basic query streaming', function (t) {
      t.test(type + '.query(sql)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query(sql);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(sql, values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query(sql, [1]);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
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
          var stream = queryable.query({ sql });
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(options, values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var stream = queryable.query({ sql }, [1]);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(query)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + 1 AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var query = mysql.createQuery(sql);
          var stream = queryable.query(query);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          basicQueryStream(stream, t);
        });
      });

      t.test(type + '.query(query_with_values)', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });
        var sql = 'SELECT 1 + ? AS solution';
        factory(function () {
          agent.startTransaction('foo');
          var query = mysql.createQuery(sql, [1]);
          var stream = queryable.query(query);
          t.equal(
            agent.currentSpan,
            null,
            'mysql span should not bleed into calling code',
          );
          basicQueryStream(stream, t);
        });
      });
    });

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
              'each mysql span is a child of the transaction',
            );
          });

          t.end();
        });

        var sql = 'SELECT 1 + ? AS solution';

        factory(function () {
          var n = 0;
          var trans = agent.startTransaction('foo');

          queryable.query(sql, [1], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 2);
            if (++n === 3) done();
          });
          queryable.query(sql, [2], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 3);
            if (++n === 3) done();
          });
          queryable.query(sql, [3], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 4);
            if (++n === 3) done();
          });

          function done() {
            trans.end();
          }
        });
      });

      t.test('on different connections', function (t) {
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
              'each mysql span is a child of the transaction',
            );
          });

          t.end();
        });

        var sql = 'SELECT 1 + ? AS solution';

        createPool(function () {
          var n = 0;
          var trans = agent.startTransaction('foo');

          queryable.getConnection(function (err, conn) {
            t.error(err);
            conn.query(sql, [1], function (err, rows, fields) {
              t.error(err);
              t.strictEqual(rows[0].solution, 2);
              if (++n === 3) done();
            });
          });
          queryable.getConnection(function (err, conn) {
            t.error(err);
            conn.query(sql, [2], function (err, rows, fields) {
              t.error(err);
              t.strictEqual(rows[0].solution, 3);
              if (++n === 3) done();
            });
          });
          queryable.getConnection(function (err, conn) {
            t.error(err);
            conn.query(sql, [3], function (err, rows, fields) {
              t.error(err);
              t.strictEqual(rows[0].solution, 4);
              if (++n === 3) done();
            });
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
        });

        t.end();
      });

      var sql = 'SELECT 1 + ? AS solution';

      factory(function () {
        setImmediate(function () {
          var trans = agent.startTransaction('foo');
          queryable.query(sql, [1], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 2);
            trans.end();
          });
        });

        setImmediate(function () {
          var trans = agent.startTransaction('bar');
          queryable.query(sql, [2], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 3);
            trans.end();
          });
        });

        setImmediate(function () {
          var trans = agent.startTransaction('baz');
          queryable.query(sql, [3], function (err, rows, fields) {
            t.error(err);
            t.strictEqual(rows[0].solution, 4);
            trans.end();
          });
        });
      });
    });

    // Only pools have a getConnection function
    if (type === 'pool') {
      t.test('connection.release()', function (t) {
        resetAgent(function (data) {
          assertBasicQuery(t, sql, data);
          t.end();
        });

        var sql = 'SELECT 1 + 1 AS solution';

        factory(function () {
          agent.startTransaction('foo');

          queryable.getConnection(function (err, conn) {
            t.error(err);
            conn.release();

            queryable.getConnection(function (err, conn) {
              t.error(err);
              conn.query(sql, basicQueryCallback(t));
            });
          });
        });
      });
    }
  });
});

function basicQueryCallback(t) {
  return function (err, rows, fields) {
    t.equal(
      agent.currentSpan,
      null,
      'mysql span should not bleed into user callback',
    );
    t.error(err);
    t.strictEqual(rows[0].solution, 2);
    agent.endTransaction();
  };
}

function basicQueryStream(stream, t) {
  var results = 0;
  stream.on('error', function (err) {
    t.equal(
      agent.currentSpan,
      null,
      'mysql span should not be active in user code',
    );
    t.error(err);
  });
  stream.on('result', function (row) {
    t.equal(
      agent.currentSpan,
      null,
      'mysql span should not be active in user code',
    );
    results++;
    t.strictEqual(row.solution, 2);
  });
  stream.on('end', function () {
    t.equal(
      agent.currentSpan,
      null,
      'mysql span should not be active in user code',
    );
    t.strictEqual(results, 1);
    agent.endTransaction();
  });
}

function assertBasicQuery(t, sql, data) {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 1);

  var trans = data.transactions[0];
  var span = data.spans[0];

  t.strictEqual(trans.name, 'foo');
  assertSpan(t, span, sql);
}

function assertSpan(t, span, sql) {
  t.strictEqual(span.name, 'SELECT', 'span.name');
  t.strictEqual(span.type, 'db', 'span.type');
  t.strictEqual(span.subtype, 'mysql', 'span.subtype');
  t.strictEqual(span.action, 'query', 'span.action');
  t.deepEqual(
    span.context.db,
    {
      statement: sql,
      type: 'sql',
      user: connectionOptions.user,
      instance: connectionOptions.database,
    },
    'span.context.db',
  );
  t.deepEqual(
    span.context.service.target,
    {
      type: 'mysql',
      name: connectionOptions.database,
    },
    'span.context.service.target',
  );
  t.deepEqual(
    span.context.destination,
    {
      address: connectionOptions.host,
      port: 3306,
      service: {
        type: '',
        name: '',
        resource: `mysql/${connectionOptions.database}`,
      },
    },
    'span.context.destination',
  );
}

function createConnection(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (queryable) {
        queryable.end();
        queryable = undefined;
      }
    };

    queryable = mysql.createConnection(connectionOptions);
    queryable.connect();

    cb();
  });
}

function createPool(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (pool) {
        pool.end();
        pool = undefined;
      }
    };

    var pool = mysql.createPool(connectionOptions);
    queryable = pool;

    cb();
  });
}

function createPoolAndGetConnection(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (pool) {
        pool.end();
        pool = undefined;
      }
    };

    var pool = mysql.createPool(connectionOptions);
    pool.getConnection(function (err, conn) {
      if (err) throw err;
      queryable = conn;
      cb();
    });
  });
}

function createPoolClusterAndGetConnection(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (cluster) {
        cluster.end();
        cluster = undefined;
      }
    };

    var cluster = mysql.createPoolCluster();
    cluster.add(connectionOptions);
    cluster.getConnection(function (err, conn) {
      if (err) throw err;
      queryable = conn;
      cb();
    });
  });
}

function createPoolClusterAndGetConnectionViaOf(cb) {
  setup(function () {
    _teardown = function teardown() {
      cluster.end();
    };

    var cluster = mysql.createPoolCluster();
    cluster.add(connectionOptions);
    cluster.of('*').getConnection(function (err, conn) {
      if (err) throw err;
      queryable = conn;
      cb();
    });
  });
}

function setup(cb) {
  teardown(); // just in case it didn't happen at the end of the previous test
  utils.reset(cb);
}

// placeholder variable to hold the _teardown function created by the setup function
var _teardown = function () {};
var teardown = function () {
  _teardown();
};

function resetAgent(expected, cb) {
  if (typeof expected === 'function') return resetAgent(2, expected);
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._apmClient.destroy) agent._apmClient.destroy();
  agent._apmClient = mockClient(expected, cb);
  agent._instrumentation.testReset();
}
