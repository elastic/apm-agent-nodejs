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

var agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  spanCompressionEnabled: false,
});

var knexVersion = require('knex/package').version;
var semver = require('semver');

// knex 0.18.0 min supported node is v8, knex 0.21.0 min supported node is v10, knex 1.0.0 min supported node is v12
if (
  (semver.gte(knexVersion, '0.18.0') && semver.lt(process.version, '8.6.0')) ||
  (semver.gte(knexVersion, '0.21.0') &&
    semver.lt(process.version, '10.22.0')) ||
  (semver.gte(knexVersion, '1.0.0') && semver.lt(process.version, '12.0.0'))
) {
  console.log(
    `# SKIP knex@${knexVersion} does not support node ${process.version}`,
  );
  process.exit();
}
// Instrumentation does not work with Knex >=0.95.0 and `contextManager=patch`.
// The "patch" context manager is deprecated.
if (
  semver.gte(knexVersion, '0.95.0') &&
  agent._conf.contextManager === 'patch'
) {
  console.log(
    `# SKIP knex@${knexVersion} and contextManager='patch' is not supported`,
  );
  process.exit();
}

var Knex = require('knex');
var test = require('tape');

var utils = require('./_utils');
var mockClient = require('../../../_mock_http_client');
const { NoopApmClient } = require('../../../../lib/apm-client/noop-apm-client');
const { runTestFixtures, sortApmEvents } = require('../../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

var transNo = 0;
var knex;

var selectTests = [
  "knex.select().from('test')",
  "knex.select('c1', 'c2').from('test')",
  "knex.column('c1', 'c2').select().from('test')",
  "knex('test').select()",
];

if (semver.gte(knexVersion, '0.11.0')) {
  selectTests.push("knex.select().from('test').timeout(10000)");
}

var insertTests = ["knex('test').insert({c1: 'test1', c2: 'test2'})"];

selectTests.forEach(function (source) {
  test(source, function (t) {
    resetAgent(function (data) {
      assertBasicQuery(t, data);
      t.end();
    });
    createClient(t, function userLandCode() {
      agent.startTransaction('foo' + ++transNo);

      var query = eval(source); // eslint-disable-line no-eval

      query
        .then(function (rows) {
          t.strictEqual(rows.length, 5);
          rows.forEach(function (row, i) {
            t.strictEqual(row.c1, 'foo' + (i + 1));
            t.strictEqual(row.c2, 'bar' + (i + 1));
          });
          agent.endTransaction();
        })
        .catch(function (err) {
          t.error(err);
        });
    });
  });
});

insertTests.forEach(function (source) {
  test(source, function (t) {
    resetAgent(function (data) {
      assertBasicQuery(t, data);
      t.end();
    });
    createClient(t, function userLandCode() {
      agent.startTransaction('foo' + ++transNo);

      var query = eval(source); // eslint-disable-line no-eval

      query
        .then(function (result) {
          t.strictEqual(result.command, 'INSERT');
          t.strictEqual(result.rowCount, 1);
          agent.endTransaction();
        })
        .catch(function (err) {
          t.error(err);
        });
    });
  });
});

test('knex.raw', function (t) {
  resetAgent(function (data) {
    assertBasicQuery(t, data);
    t.end();
  });
  createClient(t, function userLandCode() {
    agent.startTransaction('foo' + ++transNo);

    var query = knex.raw('SELECT * FROM "test"');

    query
      .then(function (result) {
        var rows = result.rows;
        t.strictEqual(rows.length, 5);
        rows.forEach(function (row, i) {
          t.strictEqual(row.c1, 'foo' + (i + 1));
          t.strictEqual(row.c2, 'bar' + (i + 1));
        });
        agent.endTransaction();
      })
      .catch(function (err) {
        t.error(err);
      });
  });
});

function assertBasicQuery(t, data) {
  t.strictEqual(data.transactions.length, 1);

  var trans = data.transactions[0];

  t.strictEqual(trans.name, 'foo' + transNo);

  // remove the 'select versions();' query that knex injects - just makes
  // testing too hard
  data.spans = data.spans.filter(function (span) {
    return span.context.db.statement !== 'select version();';
  });

  t.strictEqual(data.spans.length, 1);
  t.strictEqual(data.spans[0].type, 'db');
  t.strictEqual(data.spans[0].subtype, 'postgresql');
  t.strictEqual(data.spans[0].action, 'query');
  t.ok(
    data.spans[0].stacktrace.some(function (frame) {
      return frame.function === 'userLandCode';
    }),
    'include user-land code frame',
  );
}

function createClient(t, cb) {
  setup(function () {
    knex = Knex({
      client: 'pg',
      connection: {
        database: 'test_elastic_apm',
        user: process.env.PGUSER || 'postgres',
      },
    });
    t.on('end', () => {
      knex.destroy(function (err) {
        if (err) throw err;
      });
      knex = undefined;
    });
    cb();
  });
}

function setup(cb) {
  utils.reset(function () {
    utils.loadData(cb);
  });
}

function resetAgent(cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._apmClient.destroy) agent._apmClient.destroy();
  agent._apmClient = mockClient(cb);
  agent._instrumentation.testReset();
}

const testFixtures = [
  {
    // The main things to test here are that (a) knex instrumentation works
    // with ESM and (b) that the span stacktraces are the expected "better"
    // stack trace.
    name: 'knex ESM',
    script: '../fixtures/use-knex-pg.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1',
      ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION: '0', // enable span stack traces
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
      // In earlier 'pg' versions this results in an unhandledRejection that I
      // don't understand. Not sure it is worth debugging.
      pg: '>=8',
      // Tests fail with knex 0.17.0. Might be due to bluebird. Not work debugging.
      knex: '>=0.20',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        6,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      const trans = events[0].transaction;
      t.equal(trans.name, 'trans', 'transaction.name');

      const spans = events.slice(1).map((e) => e.span);
      // Check common values.
      const expectedSpanNames = [
        'SELECT',
        'CREATE TABLE "users"',
        'INSERT INTO "users"',
        'SELECT FROM "users"',
      ];
      spans.forEach((s, idx) => {
        t.equal(s.name, expectedSpanNames[idx], `span[${idx}].name`);
        t.equal(s.type, 'db', `span[${idx}].type`);
        t.equal(s.subtype, 'postgresql', `span[${idx}].action`);
        t.equal(s.parent_id, trans.id, `span[${idx}].parent_id`);
        if (s.context.db.statement === 'select version();') {
          // Skip this one, it is injected by knex.
          return;
        }
        t.ok(
          s.stacktrace.some((frame) => frame.function === 'useTheDb'),
          'span stacktrace includes "useTheDb" function',
        );
      });
    },
  },
];

test('knex fixtures', (suite) => {
  // Undo the `agent._apmClient = ...` from earlier `resetAgent` usage.
  agent._apmClient = new NoopApmClient();

  runTestFixtures(suite, testFixtures);
  suite.end();
});
