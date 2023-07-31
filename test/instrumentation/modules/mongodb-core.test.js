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

var agent = require('../../..').start({
  serviceName: 'test-mongodb-core',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false,
});

var Server = require('mongodb-core').Server;
var semver = require('semver');
var test = require('tape');
var mongodbCoreVersion = require('mongodb-core/package').version;

var mockClient = require('../../_mock_http_client');

test('instrument simple command', function (t) {
  // Because a variable number of events to the APM server is possible (see
  // the "Note ... additional spans" below), we cannot use the 'expected' arg
  // to `mockClient` here.
  resetAgent(function (data) {
    var expectedSpanNamesInOrder = [
      'system.$cmd.ismaster',
      'elasticapm.test.insert',
      'elasticapm.test.update',
      'elasticapm.test.remove',
      'elasticapm.test.find',
      'system.$cmd.ismaster',
    ];

    t.strictEqual(data.transactions.length, 1);
    var trans = data.transactions[0];
    t.strictEqual(trans.name, 'foo', 'transaction.name');
    t.strictEqual(trans.type, 'bar', 'transaction.type');
    t.strictEqual(trans.result, 'success', 'transaction.result');

    // Ensure spans are sorted by start time.
    data.spans = data.spans.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });

    // Check that the APM server received the expected spans in order.
    //
    // Note that there might be some additional spans that we allow and ignore:
    // - mongodb-core@1.x always does a `admin.$cmd.ismaster` or
    //   `system.$cmd.ismaster` (the latter in for mongodb-core@<=1.2.22)
    //   command on initial connection. The APM agent captures this if
    //   `contextManager != "patch"`.
    // - mongodb-core@1.x includes `elasticapm.$cmd.command` spans after the
    //   insert, update, and remove commands.
    for (var i = 0; i < data.spans.length; i++) {
      const span = data.spans[i];
      if (semver.lt(mongodbCoreVersion, '2.0.0')) {
        if (span.name === 'admin.$cmd.ismaster' && i === 0) {
          t.comment("ignore extra 'admin.$cmd.ismaster' captured span");
          continue;
        } else if (
          span.name === 'system.$cmd.ismaster' &&
          expectedSpanNamesInOrder[0] !== 'system.$cmd.ismaster'
        ) {
          t.comment("ignore extra 'system.$cmd.ismaster' captured span");
          continue;
        } else if (span.name === 'elasticapm.$cmd.command') {
          t.comment("ignore extra 'elasticapm.$cmd.command' captured span");
          continue;
        }
      }

      t.strictEqual(
        span.name,
        expectedSpanNamesInOrder[0],
        'captured span has expected name: ' + expectedSpanNamesInOrder[0],
      );
      t.strictEqual(span.type, 'db', 'span has expected type');
      t.strictEqual(span.subtype, 'mongodb', 'span has expected subtype');
      t.strictEqual(span.action, 'query', 'span has expected action');
      t.strictEqual(
        span.parent_id,
        trans.id,
        'span is a direct child of transaction',
      );
      var offset = span.timestamp - trans.timestamp;
      t.ok(
        offset + span.duration * 1000 < trans.duration * 1000,
        `span ends (${
          span.timestamp / 1000 + span.duration
        }ms) before the transaction (${
          trans.timestamp / 1000 + trans.duration
        }ms)`,
      );
      const dbInstance = expectedSpanNamesInOrder[0].slice(
        0,
        expectedSpanNamesInOrder[0].lastIndexOf('.'),
      );
      t.deepEqual(
        span.context.db,
        { type: 'mongodb', instance: dbInstance },
        'span.context.db',
      );
      t.deepEqual(
        span.context.service.target,
        { type: 'mongodb', name: dbInstance },
        'span.context.service.target',
      );

      // A current limitation of the mongodb-core instrumentation is that
      // it does not set destination.{address,port} for cursor operations like
      // "find".
      if (span.context.destination.address) {
        t.deepEqual(
          span.context.destination,
          {
            address: span.context.destination.address,
            port: 27017,
            service: { type: '', name: '', resource: `mongodb/${dbInstance}` },
          },
          'span.context.destination',
        );
      } else {
        t.deepEqual(
          span.context.destination,
          {
            service: { type: '', name: '', resource: `mongodb/${dbInstance}` },
          },
          'span.context.destination',
        );
      }

      expectedSpanNamesInOrder.shift();
    }

    t.end();
  });

  var server = new Server({ host: process.env.MONGODB_HOST });

  agent.startTransaction('foo', 'bar');

  // test example lifted from https://github.com/christkv/mongodb-core/blob/2.0/README.md#connecting-to-mongodb
  server.on('connect', function (_server) {
    _server.command('system.$cmd', { ismaster: true }, function (err, results) {
      t.error(err, 'no error from system.$cmd');
      t.strictEqual(results.result.ismaster, true, 'result.ismaster');

      _server.insert(
        'elasticapm.test',
        [{ a: 1 }, { a: 2 }, { a: 3 }],
        { writeConcern: { w: 1 }, ordered: true },
        function (err, results) {
          t.error(err, 'no error from insert');
          t.strictEqual(results.result.n, 3);

          _server.update(
            'elasticapm.test',
            [{ q: { a: 1 }, u: { $set: { b: 1 } } }],
            { writeConcern: { w: 1 }, ordered: true },
            function (err, results) {
              t.error(err, 'no error from update');
              t.strictEqual(results.result.n, 1);

              _server.remove(
                'elasticapm.test',
                [{ q: { a: 1 }, limit: 1 }],
                { writeConcern: { w: 1 }, ordered: true },
                function (err, results) {
                  t.error(err, 'no error from remove');
                  t.strictEqual(results.result.n, 1);

                  var cursor = _server.cursor('elasticapm.test', {
                    find: 'elasticapm.test',
                    query: {},
                  });
                  cursor.next(function (err, doc) {
                    t.error(err, 'no error from cursor.next');
                    t.strictEqual(doc.a, 2, 'doc.a');

                    cursor.next(function (err, doc) {
                      t.error(err, 'no error from cursor.next');
                      t.strictEqual(doc.a, 3, 'doc.a');

                      _server.command(
                        'system.$cmd',
                        { ismaster: true },
                        function (err, result) {
                          t.error(err, 'no error from system.$cmd');
                          agent.endTransaction();

                          // Cleanup
                          _server.remove(
                            'elasticapm.test',
                            [{ q: {}, limit: 0 }],
                            { writeConcern: { w: 1 }, ordered: true },
                            function (err, results) {
                              if (err) throw err;
                              _server.destroy();
                            },
                          );
                          t.ok(
                            agent.currentSpan === null,
                            'no currentSpan in sync code after mongodb-core client command',
                          );
                        },
                      );
                      t.ok(
                        agent.currentSpan === null,
                        'no currentSpan in sync code after mongodb-core client command',
                      );
                    });
                    t.ok(
                      agent.currentSpan === null,
                      'no currentSpan in sync code after mongodb-core client command',
                    );
                  });
                  t.ok(
                    agent.currentSpan === null,
                    'no currentSpan in sync code after mongodb-core client command',
                  );
                },
              );
              t.ok(
                agent.currentSpan === null,
                'no currentSpan in sync code after mongodb-core client command',
              );
            },
          );
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in sync code after mongodb-core client command',
          );
        },
      );
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after mongodb-core client command',
      );
    });
    t.ok(
      agent.currentSpan === null,
      'no currentSpan in sync code after mongodb-core client command',
    );
  });

  server.connect();
});

function resetAgent(expected, cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(expected, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
