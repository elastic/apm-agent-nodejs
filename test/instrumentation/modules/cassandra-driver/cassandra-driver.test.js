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

const test = require('tape');
const semver = require('semver');
const { validateSpan } = require('../../../_validate_schema');
const {
  runTestFixtures,
  safeGetPackageVersion,
  sortApmEvents,
} = require('../../../_utils');

const CASSANDRA_VERSION = safeGetPackageVersion('cassandra-driver');
const TEST_KEYSPACE = 'mykeyspace';
const TEST_TABLE = 'myTable';
const TEST_DATACENTER = 'datacenter1';
const TEST_USE_PROMISES = String(semver.satisfies(CASSANDRA_VERSION, '>=3.2'));

const testFixtures = [
  {
    name: 'cassandra-driver simple usage for versions <4.7.0',
    script: 'fixtures/use-cassandra-driver.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      TEST_KEYSPACE,
      TEST_TABLE,
      TEST_DATACENTER,
      TEST_USE_PROMISES,
    },
    versionRanges: {
      // cassandra-driver@4.7.0 introduced a change that requires nodejs v16.9
      // and up but previous versions support from v8 so we want to test
      // these previous driver versions with all node versions in TAV
      'cassandra-driver': '>=3.0.0 <4.7.0',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      // First the transaction.
      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;

      // Get the spans to check
      const spans = events
        .filter((e) => e.span)
        // 1st span is a `connect` and some commands may
        // connect again so we filter them out
        .filter((e, i) => i === 0 || e.span.action !== 'connect')
        .map((e) => e.span);

      // Compare some common fields across all spans.
      spans.forEach((s) => {
        const errs = validateSpan(s);
        t.equal(errs, null, 'span is valid  (per apm-server intake schema)');
      });
      t.equal(
        spans.filter((s) => s.trace_id === tx.trace_id).length,
        spans.length,
        'all spans have the same trace_id',
      );
      t.equal(
        spans.filter((s) => s.transaction_id === tx.id).length,
        spans.length,
        'all spans have the same transaction_id',
      );
      t.equal(
        spans.filter((s) => s.sync === false).length,
        spans.length,
        'all spans have sync=false',
      );
      t.equal(
        spans.filter((s) => s.sample_rate === 1).length,
        spans.length,
        'all spans have sample_rate=1',
      );
      spans.forEach((s) => {
        // Remove variable and common fields to facilitate t.deepEqual below.
        delete s.id;
        delete s.transaction_id;
        delete s.parent_id;
        delete s.trace_id;
        delete s.timestamp;
        delete s.duration;
        delete s.sync;
        delete s.sample_rate;
      });

      // Work through each of the pipeline functions (connect, execute, ...) in the script:
      t.deepEqual(
        spans.shift(),
        {
          name: 'Cassandra: Connect',
          type: 'db',
          subtype: 'cassandra',
          action: 'connect',
          context: {
            db: { type: 'cassandra' },
            service: { target: { type: 'cassandra' } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: 'cassandra',
              },
            },
          },
          outcome: 'success',
        },
        'connect produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'CREATE',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            service: {
              target: { type: 'cassandra' },
            },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra`,
              },
            },
            db: {
              type: 'cassandra',
              statement: `CREATE KEYSPACE IF NOT EXISTS ${TEST_KEYSPACE} WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': 1 };`,
            },
          },
          outcome: 'success',
        },
        'create keyspace produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: `USE ${TEST_KEYSPACE}`,
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            service: {
              target: {
                type: 'cassandra',
              },
            },
            destination: {
              service: {
                type: '',
                name: '',
                resource: 'cassandra',
              },
            },
            db: {
              type: 'cassandra',
              statement: `USE ${TEST_KEYSPACE}`,
            },
          },
          outcome: 'success',
        },
        'use keyspace produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'CREATE TABLE IF',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            service: {
              target: {
                type: 'cassandra',
                name: TEST_KEYSPACE,
              },
            },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
            db: {
              type: 'cassandra',
              statement: `CREATE TABLE IF NOT EXISTS ${TEST_KEYSPACE}.${TEST_TABLE}(id uuid,text varchar,PRIMARY KEY(id));`,
              instance: TEST_KEYSPACE,
            },
          },
          outcome: 'success',
        },
        'create table produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SELECT FROM system.local',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: 'SELECT key FROM system.local',
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'execute with callback produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SELECT FROM system.local',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: 'SELECT key FROM system.local',
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'execute with promise produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'Cassandra: Batch query',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: [
                `INSERT INTO ${TEST_TABLE} (id, text) VALUES (uuid(), ?)`,
                `INSERT INTO ${TEST_TABLE} (id, text) VALUES (uuid(), ?)`,
              ].join(';\n'),
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'batch with callback produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'Cassandra: Batch query',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: [
                `INSERT INTO ${TEST_TABLE} (id, text) VALUES (uuid(), ?)`,
                `INSERT INTO ${TEST_TABLE} (id, text) VALUES (uuid(), ?)`,
              ].join(';\n'),
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'batch with promise produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SELECT FROM system.local',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: 'SELECT key FROM system.local',
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'eachRow produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SELECT FROM system.local',
          type: 'db',
          subtype: 'cassandra',
          action: 'query',
          context: {
            db: {
              type: 'cassandra',
              statement: 'SELECT key FROM system.local',
              instance: TEST_KEYSPACE,
            },
            service: { target: { type: 'cassandra', name: TEST_KEYSPACE } },
            destination: {
              service: {
                type: '',
                name: '',
                resource: `cassandra/${TEST_KEYSPACE}`,
              },
            },
          },
          outcome: 'success',
        },
        'stream produced expected span',
      );

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
  {
    name: 'cassandra-driver ESM',
    script: 'fixtures/use-cassandra-driver.mjs',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      TEST_DATACENTER,
    },
    versionRanges: {
      node: '^16.9.0 || ^18.1.0 <20',
      'cassandra-driver': '>=4.7.0',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      // First the transaction.
      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;
      const connSpan = events.shift().span;
      const querySpan = events.shift().span;

      t.equal(connSpan.parent_id, tx.id, 'span.parent_id');
      t.equal(connSpan.name, 'Cassandra: Connect', 'span.name');
      t.equal(querySpan.parent_id, tx.id, 'span.parent_id');
      t.equal(querySpan.name, 'SELECT FROM system.local', 'span.name');
      t.equal(events.length, 0, 'all events accounted for');
    },
  },
];

// We need to do exactly the same test for `cassandra-driver` v4.7.0 and up
// the only difference is we require NodeJS version to be >16.
// This is necessary because of an issue in the driver that led to
// a change in the node compatibility from >=8 to >=16
//
// The issue: https://datastax-oss.atlassian.net/browse/NODEJS-665
testFixtures.push(
  Object.assign({}, testFixtures[0], {
    name: 'cassandra-driver simple usage for versions >=4.7.0',
    versionRanges: {
      node: '>=16.9',
      'cassandra-driver': '>=4.7.0',
    },
  }),
);

test('cassandra-driver fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
