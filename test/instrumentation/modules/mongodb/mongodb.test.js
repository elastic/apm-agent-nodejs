/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Tests of the instrumentation for `mongodb` module.
//
// They have been split into 3 sections:
// - Test of normal usage of the module with prmises and callback APIs
// - Test of the connection API to ensure the client returnes is properly instrumented
// - Test of cursors working concurrently to check if spans are attached to
//   the right transaction.

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const isMongodbIncompat = require('../../../_is_mongodb_incompat')();
if (isMongodbIncompat) {
  console.log(`# SKIP ${isMongodbIncompat}`);
  process.exit();
}

const test = require('tape');
const semver = require('semver');

const { validateSpan } = require('../../../_validate_schema');
const {
  runTestFixtures,
  safeGetPackageVersion,
  sortApmEvents,
} = require('../../../_utils');

const MONGODB_VERSION = safeGetPackageVersion('mongodb');
// Setting `localhost` will set `span.context.destination.address` to [::1] sometimes
const TEST_HOST = process.env.MONGODB_HOST || '127.0.0.1';
const TEST_PORT = '27017';
const TEST_DB = 'elasticapm';
const TEST_COLLECTION = 'test';
const TEST_USE_CALLBACKS = semver.satisfies(MONGODB_VERSION, '<5');

/** @type {import('../../../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'mongodb usage scenario',
    script: 'fixtures/use-mongodb.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      TEST_HOST,
      TEST_PORT,
      TEST_DB,
      TEST_COLLECTION,
      TEST_USE_CALLBACKS: String(TEST_USE_CALLBACKS),
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      // First the transaction.
      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;

      // Compare some common fields across all spans.
      // ignore http/external spans
      const spans = events
        .filter((e) => e.span && e.span.type !== 'external')
        .map((e) => e.span);
      spans.forEach((s) => {
        const errs = validateSpan(s);
        t.equal(errs, null, 'span is valid (per apm-server intake schema)');
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

      // We can't easily assert destination.address because mongodb >3.5.0
      // returns a resolved IP for the given connection hostname. In our CI
      // setup, the host is set to "mongodb" which is a Docker container with
      // some IP. We could `dns.resolve4()` here, but that's overkill I think.
      const RESOLVED_ADDRESS = spans[0].context.destination.address;

      t.ok(RESOLVED_ADDRESS, 'context.destination.address is defined');

      // Work through each of the pipeline functions (insertMany, findOne, ...) in the script:
      const insertManySpan = {
        name: 'elasticapm.test.insert',
        type: 'db',
        subtype: 'mongodb',
        action: 'insert',
        context: {
          service: {
            target: {
              type: 'mongodb',
              name: TEST_DB,
            },
          },
          destination: {
            address: RESOLVED_ADDRESS,
            port: Number(TEST_PORT),
            service: {
              type: '',
              name: '',
              resource: `mongodb/${TEST_DB}`,
            },
          },
          db: {
            type: 'mongodb',
            instance: TEST_DB,
          },
        },
        outcome: 'success',
      };
      t.deepEqual(
        spans.shift(),
        insertManySpan,
        'insertMany produced expected span',
      );

      if (TEST_USE_CALLBACKS) {
        t.deepEqual(
          spans.shift(),
          insertManySpan,
          'insertMany with callback produced expected span',
        );
      }

      const findOneSpan = {
        name: 'elasticapm.test.find',
        type: 'db',
        subtype: 'mongodb',
        action: 'find',
        context: {
          service: {
            target: {
              type: 'mongodb',
              name: TEST_DB,
            },
          },
          destination: {
            address: RESOLVED_ADDRESS,
            port: Number(TEST_PORT),
            service: {
              type: '',
              name: '',
              resource: `mongodb/${TEST_DB}`,
            },
          },
          db: {
            type: 'mongodb',
            instance: TEST_DB,
          },
        },
        outcome: 'success',
      };
      t.deepEqual(spans.shift(), findOneSpan, 'findOne produced expected span');

      t.deepEqual(spans.shift(), findOneSpan, 'findOne 1st concurrent call');
      t.deepEqual(spans.shift(), findOneSpan, 'findOne 2nd concurrent call');
      t.deepEqual(spans.shift(), findOneSpan, 'findOne 3rd concurrent call');

      if (TEST_USE_CALLBACKS) {
        t.deepEqual(
          spans.shift(),
          findOneSpan,
          'findOne with callback produced expected span',
        );
      }

      const updateOneSpan = {
        name: 'elasticapm.test.update',
        type: 'db',
        subtype: 'mongodb',
        action: 'update',
        context: {
          service: {
            target: {
              type: 'mongodb',
              name: TEST_DB,
            },
          },
          destination: {
            address: RESOLVED_ADDRESS,
            port: Number(TEST_PORT),
            service: {
              type: '',
              name: '',
              resource: `mongodb/${TEST_DB}`,
            },
          },
          db: {
            type: 'mongodb',
            instance: TEST_DB,
          },
        },
        outcome: 'success',
      };
      t.deepEqual(
        spans.shift(),
        updateOneSpan,
        'updateOne produced expected span',
      );

      if (TEST_USE_CALLBACKS) {
        t.deepEqual(
          spans.shift(),
          updateOneSpan,
          'updateOne with callbacks produced expected span',
        );
      }

      const deleteOneSpan = {
        name: 'elasticapm.test.delete',
        type: 'db',
        subtype: 'mongodb',
        action: 'delete',
        context: {
          service: {
            target: {
              type: 'mongodb',
              name: TEST_DB,
            },
          },
          destination: {
            address: RESOLVED_ADDRESS,
            port: Number(TEST_PORT),
            service: {
              type: '',
              name: '',
              resource: `mongodb/${TEST_DB}`,
            },
          },
          db: {
            type: 'mongodb',
            instance: TEST_DB,
          },
        },
        outcome: 'success',
      };
      t.deepEqual(
        spans.shift(),
        deleteOneSpan,
        'deleteOne produced expected span',
      );

      if (TEST_USE_CALLBACKS) {
        t.deepEqual(
          spans.shift(),
          deleteOneSpan,
          'deleteOne with callbacks produced expected span',
        );
      }

      t.deepEqual(
        spans.shift(),
        {
          name: 'elasticapm.test.find',
          type: 'db',
          subtype: 'mongodb',
          action: 'find',
          context: {
            service: {
              target: {
                type: 'mongodb',
                name: TEST_DB,
              },
            },
            destination: {
              address: RESOLVED_ADDRESS,
              port: Number(TEST_PORT),
              service: {
                type: '',
                name: '',
                resource: `mongodb/${TEST_DB}`,
              },
            },
            db: {
              type: 'mongodb',
              instance: TEST_DB,
            },
          },
          outcome: 'success',
        },
        'find produced expected span',
      );

      const deleteManySpan = {
        name: 'elasticapm.test.delete',
        type: 'db',
        subtype: 'mongodb',
        action: 'delete',
        context: {
          service: {
            target: {
              type: 'mongodb',
              name: TEST_DB,
            },
          },
          destination: {
            address: RESOLVED_ADDRESS,
            port: Number(TEST_PORT),
            service: {
              type: '',
              name: '',
              resource: `mongodb/${TEST_DB}`,
            },
          },
          db: {
            type: 'mongodb',
            instance: TEST_DB,
          },
        },
        outcome: 'success',
      };
      t.deepEqual(
        spans.shift(),
        deleteManySpan,
        'deleteMany produced expected span',
      );

      if (TEST_USE_CALLBACKS) {
        t.deepEqual(
          spans.shift(),
          deleteManySpan,
          'deleteMany with callbacks produced expected span',
        );
      }

      t.equal(
        spans.length,
        0,
        `all spans accounted for, remaining spans: ${JSON.stringify(spans)}`,
      );
    },
  },
  {
    name: 'mongodb variations of connection',
    script: 'fixtures/use-mongodb-connect.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      TEST_HOST,
      TEST_PORT,
      TEST_DB,
      TEST_COLLECTION,
      TEST_USE_CALLBACKS: String(TEST_USE_CALLBACKS),
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      const tx = events.shift().transaction;
      t.ok(tx, 'got the transaction');

      const spans = events
        .filter(
          (e) =>
            e.span && e.span.type !== 'external' && e.span.action === 'find',
        )
        .map((e) => e.span);

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

      const connectionsMade = TEST_USE_CALLBACKS ? 4 : 1;

      for (let i = 0; i < connectionsMade; i++) {
        let span = spans.shift();
        // We can't easily assert destination.address because mongodb >3.5.0
        // returns a resolved IP for the given connection hostname. In our CI
        // setup, the host is set to "mongodb" which is a Docker container with
        // some IP. We could `dns.resolve4()` here, but that's overkill I think.
        let addr = span.context.destination.address;

        t.ok(addr, 'context.destination.address is defined');
        t.deepEqual(
          span,
          {
            name: 'elasticapm.test.find',
            type: 'db',
            subtype: 'mongodb',
            action: 'find',
            context: {
              service: {
                target: {
                  type: 'mongodb',
                  name: TEST_DB,
                },
              },
              destination: {
                address: addr,
                port: Number(TEST_PORT),
                service: {
                  type: '',
                  name: '',
                  resource: `mongodb/${TEST_DB}`,
                },
              },
              db: {
                type: 'mongodb',
                instance: TEST_DB,
              },
            },
            outcome: 'success',
          },
          'findOne produced expected span',
        );
      }

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
  {
    name: 'mongodb concurrency and async context',
    script: 'fixtures/use-mongodb-async-context.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      TEST_HOST,
      TEST_PORT,
      TEST_DB,
      TEST_COLLECTION,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);

      const spans = events
        .filter((e) => e.span && e.span.type !== 'external')
        .map((e) => e.span);

      while (transactions.length) {
        const tx = transactions.shift();
        const idx = spans.findIndex((s) => s.parent_id === tx.id);

        t.ok(idx !== -1, 'transaction has a child span');

        const [span] = spans.splice(idx, 1);

        t.equal(span.name, 'elasticapm.test.find', 'span.name');
      }

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
];

test('mongodb fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
