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

const semver = require('semver');
const { safeGetPackageVersion } = require('../../../_utils');
const mariadbVer = safeGetPackageVersion('mariadb');
if (semver.gte(mariadbVer, '3.0.0') && semver.lt(process.version, '14.0.0')) {
  console.log(
    `# SKIP mariadb@${mariadbVer} does not support node ${process.version}`,
  );
  process.exit();
}

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false,
});

var mariadb = require('mariadb/callback');
var mariadbPromise = require('mariadb');
var test = require('tape');

var utils = require('./_utils');
var mockClient = require('../../../_mock_http_client');

var connectionOptions = utils.credentials();
var queryable;
var queryablePromise;
var factories = [
  [createConnection, 'connection', true],
  [createPool, 'pool', true],
  [createPoolAndGetConnection, 'pool > connection', true],
  [createPoolClusterAndGetConnection, 'poolCluster > connection', true],
  [
    createPoolClusterAndGetConnectionViaOf,
    'poolCluster > of > connection',
    false,
  ],
  [
    createPoolClusterAndGetConnectionViaOfDirect,
    'poolCluster > ofConnection',
    false,
  ],
];
// var executors = ['execute'];
// var executors = ['queryStream'];
var executors = ['query', 'execute', 'queryStream', 'batch', 'prepare'];

var universalArgumentSets = [
  {
    names: ['sql'],
    query: 'SELECT 1 + 1 AS solution',
    values: (query, cb) => [query, cb],
  },
  {
    names: ['sql', 'values'],
    query: 'SELECT 1 + ? AS solution',
    values: (query, cb) => [query, ['1'], cb],
  },
  {
    names: ['options'],
    query: 'SELECT 1 + 1 AS solution',
    values: (query, cb) => [{ sql: query }, cb],
  },
  {
    names: ['options', 'values'],
    query: 'SELECT 1 + ? AS solution',
    values: (query, cb) => [{ sql: query }, ['1'], cb],
  },
];

var batchArgumentSets = [
  {
    names: ['sql', 'values'],
    query: 'INSERT INTO users (name) VALUES (?)',
    values: (query, cb) => [query, [['test'], ['test2']], cb],
  },
  {
    names: ['options', 'values'],
    query: 'INSERT INTO users (name) VALUES (?)',
    values: (query, cb) => [{ sql: query }, [['test'], ['test2']], cb],
  },
];

factories.forEach(function (f) {
  var factory = f[0];
  var type = f[1];
  var hasCallback = f[2];

  test('mariadb.' + factory.name, function (t) {
    t.on('end', teardown);
    executors.forEach(function (executor) {
      t.test(executor, function (t) {
        var argumentSets =
          executor === 'batch' ? batchArgumentSets : universalArgumentSets;

        if (executor === 'queryStream') {
          if (!['pool'].includes(type)) {
            t.test('streaming promise', function (t) {
              argumentSets.forEach(function (argumentSet) {
                var query = argumentSet.query;
                var names = argumentSet.names;
                var values = argumentSet.values;
                var name = `${type}.${executor}(${names.join(', ')})`;
                var args = values(query);
                t.test(name, function (t) {
                  resetAgent(function (data) {
                    assertBasicQuery(t, query, data);
                    t.end();
                  });
                  factory(function () {
                    agent.startTransaction('foo');
                    var stream = queryablePromise[executor].apply(
                      queryablePromise,
                      args,
                    );
                    t.ok(
                      agent.currentSpan === null,
                      'mariadb span should not spill into calling code',
                    );
                    basicQueryStream(stream, t);
                  });
                });
              });
            });
            if (hasCallback) {
              t.test('streaming callback', function (t) {
                argumentSets.forEach(function (argumentSet) {
                  var query = argumentSet.query;
                  var names = argumentSet.names;
                  var values = argumentSet.values;
                  var name = `${type}.${executor}(${names.join(', ')})`;
                  var args = values(query);
                  t.test(name, function (t) {
                    resetAgent(function (data) {
                      assertBasicQuery(t, query, data);
                      t.end();
                    });
                    factory(function () {
                      agent.startTransaction('foo');
                      var stream = queryable.query.apply(queryable, args);
                      t.ok(
                        agent.currentSpan === null,
                        'mariadb span should not spill into calling code',
                      );
                      basicQueryStream(stream, t);
                    });
                  });
                });
              });
            }
          } else {
            t.end();
          }
        } else if (executor === 'prepare') {
          if (!['pool'].includes(type)) {
            t.test('prepare', function (t) {
              argumentSets.forEach(function (argumentSet) {
                var query = argumentSet.query;
                var names = argumentSet.names;
                var values = argumentSet.values;
                var name = `${type}.${executor}(${names.join(', ')})`;
                var args = values(query);
                t.test(name, function (t) {
                  resetAgent(function (data) {
                    assertBasicQuery(t, query, data);
                    t.end();
                  });
                  factory(function () {
                    agent.startTransaction('foo');
                    queryablePromise[executor]
                      .apply(queryablePromise, [args[0]])
                      .then((preparedStatement) => {
                        var result = preparedStatement.execute(args[1]);

                        t.ok(
                          agent.currentSpan === null,
                          'mariadb span should not spill into calling code',
                        );
                        basicQueryPromise(t, result);
                      });
                  });
                });
              });
            });
            t.test('prepare stream', function (t) {
              argumentSets.forEach(function (argumentSet) {
                var query = argumentSet.query;
                var names = argumentSet.names;
                var values = argumentSet.values;
                var name = `${type}.${executor}(${names.join(', ')})`;
                var args = values(query);
                t.test(name, function (t) {
                  resetAgent(function (data) {
                    assertBasicQuery(t, query, data);
                    t.end();
                  });
                  factory(function () {
                    agent.startTransaction('foo');
                    queryablePromise[executor]
                      .apply(queryablePromise, [args[0]])
                      .then((preparedStatement) => {
                        var result = preparedStatement.executeStream(args[1]);

                        t.ok(
                          agent.currentSpan === null,
                          'mariadb span should not spill into calling code',
                        );
                        basicQueryStream(result, t);
                      });
                  });
                });
              });
            });
          } else {
            t.end();
          }
        } else {
          if (hasCallback) {
            t.test('callback', function (t) {
              argumentSets.forEach(function (argumentSet) {
                var query = argumentSet.query;
                var names = argumentSet.names;
                var values = argumentSet.values;
                var name = `${type}.${executor}(${names.join(', ')}, callback)`;
                var args =
                  executor === 'batch'
                    ? values(query, batchQueryCallback(t))
                    : values(query, basicQueryCallback(t));
                t.test(name, function (t) {
                  resetAgent(function (data) {
                    assertBasicQuery(
                      t,
                      query,
                      data,
                      executor === 'batch' ? 'INSERT INTO users' : 'SELECT',
                    );
                    t.end();
                  });
                  factory(function () {
                    agent.startTransaction('foo');
                    queryable[executor].apply(queryable, args);
                    t.ok(
                      agent.currentSpan === null,
                      'mariadb span should not spill into calling code',
                    );
                  });
                });
              });
            });
          }
          t.test('promise', function (t) {
            argumentSets.forEach(function (argumentSet) {
              var query = argumentSet.query;
              var names = argumentSet.names;
              var values = argumentSet.values;
              var name = `${type}.${executor}(${names.join(', ')})`;
              var args = values(query);
              t.test(name, function (t) {
                resetAgent(function (data) {
                  assertBasicQuery(
                    t,
                    query,
                    data,
                    executor === 'batch' ? 'INSERT INTO users' : 'SELECT',
                  );
                  t.end();
                });
                factory(function () {
                  agent.startTransaction('foo');
                  var promise = queryablePromise[executor].apply(
                    queryablePromise,
                    args,
                  );
                  t.ok(
                    agent.currentSpan === null,
                    'mariadb span should not spill into calling code',
                  );
                  if (executor === 'batch') {
                    batchQueryPromise(t, promise);
                  } else {
                    basicQueryPromise(t, promise);
                  }
                });
              });
            });
          });
        }
      });
    });

    // t.test('simultaneous queries', function (t) {
    //   t.test('on same connection', function (t) {
    //     resetAgent(4, function (data) {
    //       t.strictEqual(data.transactions.length, 1);
    //       t.strictEqual(data.spans.length, 3);

    //       var trans = data.transactions[0];

    //       t.strictEqual(trans.name, 'foo');

    //       data.spans.forEach(function (span) {
    //         assertSpan(t, span, sql);
    //         t.equal(
    //           span.parent_id,
    //           trans.id,
    //           'each mysql2 span is a child of the transaction',
    //         );
    //       });

    //       t.end();
    //     });

    //     var sql = 'SELECT 1 + ? AS solution';

    //     factory(function () {
    //       var n = 0;
    //       var trans = agent.startTransaction('foo');

    //       queryable.query(sql, [1], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 2);
    //         if (++n === 3) done();
    //       });
    //       queryable.query(sql, [2], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 3);
    //         if (++n === 3) done();
    //       });
    //       queryable.query(sql, [3], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 4);
    //         if (++n === 3) done();
    //       });

    //       function done() {
    //         trans.end();
    //       }
    //     });
    //   });

    //   t.test('on different connections', function (t) {
    //     resetAgent(4, function (data) {
    //       t.strictEqual(data.transactions.length, 1);
    //       t.strictEqual(data.spans.length, 3);

    //       var trans = data.transactions[0];

    //       t.strictEqual(trans.name, 'foo');

    //       data.spans.forEach(function (span) {
    //         assertSpan(t, span, sql);
    //         t.equal(
    //           span.parent_id,
    //           trans.id,
    //           'each mysql2 span is a child of the transaction',
    //         );
    //       });

    //       t.end();
    //     });

    //     var sql = 'SELECT 1 + ? AS solution';

    //     createPool(function () {
    //       var n = 0;
    //       var trans = agent.startTransaction('foo');

    //       queryable.getConnection(function (err, conn) {
    //         t.error(err);
    //         conn.query(sql, [1], function (err, rows, fields) {
    //           t.error(err);
    //           t.strictEqual(rows[0].solution, 2);
    //           if (++n === 3) done();
    //         });
    //       });
    //       queryable.getConnection(function (err, conn) {
    //         t.error(err);
    //         conn.query(sql, [2], function (err, rows, fields) {
    //           t.error(err);
    //           t.strictEqual(rows[0].solution, 3);
    //           if (++n === 3) done();
    //         });
    //       });
    //       queryable.getConnection(function (err, conn) {
    //         t.error(err);
    //         conn.query(sql, [3], function (err, rows, fields) {
    //           t.error(err);
    //           t.strictEqual(rows[0].solution, 4);
    //           if (++n === 3) done();
    //         });
    //       });

    //       function done() {
    //         trans.end();
    //       }
    //     });
    //   });
    // });

    // t.test('simultaneous transactions', function (t) {
    //   resetAgent(6, function (data) {
    //     t.strictEqual(data.transactions.length, 3);
    //     t.strictEqual(data.spans.length, 3);
    //     var names = data.transactions
    //       .map(function (trans) {
    //         return trans.name;
    //       })
    //       .sort();
    //     t.deepEqual(names, ['bar', 'baz', 'foo']);

    //     data.transactions.forEach(function (trans) {
    //       const span = findObjInArray(data.spans, 'transaction_id', trans.id);
    //       t.ok(span, 'transaction should have span');
    //       assertSpan(t, span, sql);
    //     });

    //     t.end();
    //   });

    //   var sql = 'SELECT 1 + ? AS solution';

    //   factory(function () {
    //     setImmediate(function () {
    //       var trans = agent.startTransaction('foo');
    //       queryable.query(sql, [1], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 2);
    //         trans.end();
    //       });
    //     });

    //     setImmediate(function () {
    //       var trans = agent.startTransaction('bar');
    //       queryable.query(sql, [2], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 3);
    //         trans.end();
    //       });
    //     });

    //     setImmediate(function () {
    //       var trans = agent.startTransaction('baz');
    //       queryable.query(sql, [3], function (err, rows, fields) {
    //         t.error(err);
    //         t.strictEqual(rows[0].solution, 4);
    //         trans.end();
    //       });
    //     });
    //   });
    // });

    // // Only pools have a getConnection function
    // if (type === 'pool') {
    //   t.test('connection.release()', function (t) {
    //     resetAgent(function (data) {
    //       assertBasicQuery(t, sql, data);
    //       t.end();
    //     });

    //     var sql = 'SELECT 1 + 1 AS solution';

    //     factory(function () {
    //       agent.startTransaction('foo');

    //       queryable.getConnection(function (err, conn) {
    //         t.error(err);
    //         conn.release();

    //         queryable.getConnection(function (err, conn) {
    //           t.error(err);
    //           conn.query(sql, basicQueryCallback(t));
    //           t.ok(
    //             agent.currentSpan === null,
    //             'mysql2 span should not spill into calling code',
    //           );
    //         });
    //       });
    //     });
    //   });
    // }
  });
});

function basicQueryPromise(t, p) {
  function done() {
    agent.endTransaction();
  }

  p.then(
    function (response) {
      var rows = response[0];
      t.strictEqual(rows.solution, 2);
      done();
    },
    function (error) {
      t.error(error);
      done();
    },
  );
}
function batchQueryPromise(t, p) {
  function done() {
    agent.endTransaction();
  }

  p.then(
    function (response) {
      var rows = response;
      t.strictEqual(rows.affectedRows, 2);
      done();
    },
    function (error) {
      t.error(error);
      done();
    },
  );
}

function basicQueryCallback(t) {
  return function (err, rows, fields) {
    t.ok(
      agent.currentSpan === null,
      'mariadb span should not spill into calling code',
    );
    t.error(err);
    t.strictEqual(rows[0].solution, 2);
    agent.endTransaction();
  };
}
function batchQueryCallback(t) {
  return function (err, rows, fields) {
    t.ok(
      agent.currentSpan === null,
      'mariadb span should not spill into calling code',
    );
    t.error(err);
    t.strictEqual(rows.affectedRows, 2);
    agent.endTransaction();
  };
}

function basicQueryStream(stream, t) {
  var results = 0;
  stream.on('error', function (err) {
    t.ok(
      agent.currentSpan === null,
      'mariadb span should not be active in user code',
    );
    t.error(err);
  });
  stream.on('data', function (row) {
    t.ok(
      agent.currentSpan === null,
      'mariadb span should not be active in user code',
    );
    results++;
    t.strictEqual(row.solution, 2);
  });
  stream.on('end', function () {
    t.ok(
      agent.currentSpan === null,
      'mariadb span should not be active in user code',
    );
    t.strictEqual(results, 1);
    agent.endTransaction();
  });
}

function assertBasicQuery(t, sql, data, spanName = 'SELECT') {
  t.strictEqual(data.transactions.length, 1);
  t.strictEqual(data.spans.length, 1);

  var trans = data.transactions[0];
  var span = data.spans[0];

  t.strictEqual(trans.name, 'foo');
  assertSpan(t, span, sql, spanName);
}

function assertSpan(t, span, sql, spanName = 'SELECT') {
  t.strictEqual(span.name, spanName, 'span.name');
  t.strictEqual(span.type, 'db', 'span.type');
  t.strictEqual(span.subtype, 'mariadb', 'span.subtype');
  t.strictEqual(span.action, 'query', 'span.action');
  t.deepEqual(
    span.context.db,
    {
      type: 'sql',
      instance: connectionOptions.database,
      user: connectionOptions.user,
      statement: sql,
    },
    'span.context.db',
  );
  t.deepEqual(
    span.context.service.target,
    {
      type: 'mariadb',
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
        resource: `mariadb/${connectionOptions.database}`,
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
      if (queryablePromise) {
        queryablePromise.end();
        queryablePromise = undefined;
      }
    };

    queryable = mariadb.createConnection(connectionOptions);

    queryable.connect((err) => {
      if (err) throw err;

      mariadbPromise
        .createConnection(connectionOptions)
        .then(async function (conn2) {
          queryablePromise = conn2;

          await queryablePromise.execute('DROP TABLE IF EXISTS users');

          await queryablePromise.execute(
            'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
          );
          cb();
        });
    });
  });
}

function createPool(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (queryable) {
        queryable.end();
        queryable = undefined;
      }
      if (queryablePromise) {
        queryablePromise.end();
        queryablePromise = undefined;
      }
    };

    queryable = mariadb.createPool(connectionOptions);
    queryablePromise = mariadbPromise.createPool(connectionOptions);

    queryablePromise.execute('DROP TABLE IF EXISTS users').then(() => {
      queryablePromise
        .execute(
          'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
        )
        .then(() => {
          cb();
        });
    });
  });
}

function createPoolAndGetConnection(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (pool) {
        queryable.end();
        pool.end();
        pool = undefined;
        queryable = undefined;
      }
      if (poolPromise) {
        queryablePromise.end();
        poolPromise.end();
        poolPromise = undefined;
        queryablePromise = undefined;
      }
    };

    var pool = mariadb.createPool(connectionOptions);
    var poolPromise = mariadbPromise.createPool(connectionOptions);

    pool.getConnection(function (err, conn) {
      if (err) throw err;
      queryable = conn;

      poolPromise.getConnection().then(function (conn) {
        queryablePromise = conn;

        queryablePromise.execute('DROP TABLE IF EXISTS users').then(() => {
          queryablePromise
            .execute(
              'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
            )
            .then(() => {
              cb();
            });
        });
      });
    });
  });
}

function createPoolClusterAndGetConnection(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (cluster) {
        queryable.end();
        cluster.end();
        cluster = undefined;
        queryable = undefined;
      }
      if (clusterPromise) {
        queryablePromise.end();
        clusterPromise.end();
        clusterPromise = undefined;
        queryablePromise = undefined;
      }
    };

    var cluster = mariadb.createPoolCluster();
    var clusterPromise = mariadbPromise.createPoolCluster();

    cluster.add('master', connectionOptions);
    clusterPromise.add('master', connectionOptions);

    cluster.getConnection(function (err, conn) {
      if (err) throw err;
      queryable = conn;

      clusterPromise.getConnection().then(function (conn2) {
        queryablePromise = conn2;

        queryablePromise.execute('DROP TABLE IF EXISTS users').then(() => {
          queryablePromise
            .execute(
              'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
            )
            .then(() => {
              cb();
            });
        });
      });
    });
  });
}

function createPoolClusterAndGetConnectionViaOf(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (clusterPromise) {
        queryablePromise.end();
        clusterPromise.end();
        clusterPromise = undefined;
        queryablePromise = undefined;
      }
    };

    var clusterPromise = mariadbPromise.createPoolCluster();
    clusterPromise.add('master-test', connectionOptions);
    clusterPromise
      .of('.*', 'RANDOM')
      .getConnection()
      .then((conn) => {
        queryablePromise = conn;

        queryablePromise.execute('DROP TABLE IF EXISTS users').then(() => {
          queryablePromise
            .execute(
              'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
            )
            .then(() => {
              cb();
            });
        });
      });
  });
}
function createPoolClusterAndGetConnectionViaOfDirect(cb) {
  setup(function () {
    _teardown = function teardown() {
      if (clusterPromise) {
        queryablePromise.end();
        clusterPromise.end();
        clusterPromise = undefined;
        queryablePromise = undefined;
      }
    };

    var clusterPromise = mariadbPromise.createPoolCluster();
    clusterPromise.add('master-test', connectionOptions);
    clusterPromise.getConnection('.*', 'RANDOM').then((conn) => {
      queryablePromise = conn;

      queryablePromise.execute('DROP TABLE IF EXISTS users').then(() => {
        queryablePromise
          .execute(
            'CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255))',
          )
          .then(() => {
            cb();
          });
      });
    });
  });
}

function setup(cb) {
  teardown(); // just in case it didn't happen at the end of the previous test
  utils.reset(cb);
}

// placeholder variable to hold the teardown function created by the setup function
var _teardown = function () {};
var teardown = function () {
  _teardown();
};

function resetAgent(expected, cb) {
  if (typeof expected === 'function') return resetAgent(2, expected);
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock

  if (agent._apmClient.destroy) agent._apmClient.destroy();
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(expected, cb);
}
