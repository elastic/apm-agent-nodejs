/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test S3 instrumentation of the '@aws-sdk/client-s3' module.
//
// Note that this uses localstack for testing, which mimicks the S3 API but
// isn't identical. Some known limitations:
// - It basically does nothing with regions, so testing bucket region discovery
//   isn't possible.
// - AFAIK localstack does not support Access Points, so access point ARNs
//   cannot be tested.

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
// const { NODE_VER_RANGE_IITM_GE14 } = require('../../../testconsts');

const MONGODB_VERSION = safeGetPackageVersion('mongodb');
const TEST_HOST = 'localhost';
const TEST_PORT = '27017';
const TEST_DB = 'elasticapm';
const TEST_COLLECTION = 'test';
const TEST_USE_CALLBACKS = semver.satisfies(MONGODB_VERSION, '<5');

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

      // time to get some data here
      // const sendMessageSpanId = spans[0].id;

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
            address: '127.0.0.1',
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
            address: '127.0.0.1',
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
            address: '127.0.0.1',
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
            address: '127.0.0.1',
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
              address: '127.0.0.1',
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
            address: '127.0.0.1',
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
  // {
  //   name: 'simple mongodb with ESM',
  //   script: 'fixtures/use-mongodb.mjs',
  //   cwd: __dirname,
  //   timeout: 20000, // sanity guard on the test hanging
  //   maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
  //   env: {
  //     NODE_OPTIONS:
  //       '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
  //     TEST_ENDPOINT: endpoint,
  //     TEST_REGION: 'us-east-2',
  //     TEST_QUEUE_NAME: 'elasticapmtest-queue-2',
  //   },
  //   versionRanges: {
  //     node: NODE_VER_RANGE_IITM_GE14,
  //   },
  //   verbose: false,
  //   checkApmServer: (t, apmServer) => {
  //     t.ok(apmServer.events[0].metadata, 'metadata');
  //     const events = sortApmEvents(apmServer.events);

  //     t.ok(events[0].transaction, 'got the transaction');
  //     const tx = events.shift().transaction;
  //     const spans = events
  //       .filter((e) => e.span && e.span.type !== 'external')
  //       .map((e) => e.span);

  //     t.equal(spans.length, 0, 'all spans accounted for');
  //   },
  // },
];

test('mongodb fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
