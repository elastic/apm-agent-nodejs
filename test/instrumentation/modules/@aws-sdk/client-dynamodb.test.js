/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test DynamoDB instrumentation of the '@aws-sdk/client-dynamodb' module.
//
// Note that this uses localstack for testing, which mimicks the DynamoDB API but
// isn't identical. Some known limitations:
// TODO: check limitations

const semver = require('semver');
if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}
if (process.env.ELASTIC_APM_CONTEXT_MANAGER === 'patch') {
  console.log(
    '# SKIP @aws-sdk/* instrumentation does not work with contextManager="patch"',
  );
  process.exit();
}
if (semver.lt(process.version, '14.0.0')) {
  console.log(
    `# SKIP @aws-sdk min supported node is v14 (node ${process.version})`,
  );
  process.exit();
}

const test = require('tape');

const { validateSpan } = require('../../../_validate_schema');
const { runTestFixtures, sortApmEvents } = require('../../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../../testconsts')
const AWS_REGION = 'us-east-2';
const LOCALSTACK_HOST = process.env.LOCALSTACK_HOST || 'localhost';
const endpoint = 'http://' + LOCALSTACK_HOST + ':4566';

const testFixtures = [
  {
    name: 'simple DynamoDB V3 usage scenario',
    script: 'fixtures/use-client-dynamodb.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_TABLE_NAME: 'elasticapmtest-table-3',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: AWS_REGION,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      // First the transaction.
      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;
      const errors = events.filter((e) => e.error).map((e) => e.error);

      // Compare some common fields across all spans.
      const spans = events.filter((e) => e.span).map((e) => e.span);
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

      const failingSpanId = spans[5].id; // index of non existing table error
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

      // Work through each of the pipeline functions (lisTables, createTable, ...) in the script:
      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB ListTables',
          type: 'db',
          subtype: 'dynamodb',
          action: 'ListTables',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'listTables produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB CreateTable elasticapmtest-table-3',
          type: 'db',
          subtype: 'dynamodb',
          action: 'CreateTable',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'createTable produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB PutItem elasticapmtest-table-3',
          type: 'db',
          subtype: 'dynamodb',
          action: 'PutItem',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'putItem produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB Query elasticapmtest-table-3',
          type: 'db',
          subtype: 'dynamodb',
          action: 'Query',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              statement: 'RECORD_ID = :foo',
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'query produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'get-signed-url',
          type: 'custom',
          subtype: null,
          action: null,
          outcome: 'success',
        },
        'custom span for getSignedUrl call',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB Query elasticapmtest-table-3-unexistent',
          type: 'db',
          subtype: 'dynamodb',
          action: 'Query',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              statement: 'RECORD_ID = :foo',
              type: 'dynamodb',
            },
          },
          outcome: 'failure',
        },
        'failing query produced expected span',
      );

      t.equal(errors.length, 1, 'got 1 error');
      t.equal(
        errors[0].parent_id,
        failingSpanId,
        'error is a child of the failing span',
      );
      t.equal(errors[0].transaction_id, tx.id, 'error.transaction_id');
      t.equal(
        errors[0].exception.type,
        'ResourceNotFoundException',
        'error.exception.type',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB DeleteItem elasticapmtest-table-3',
          type: 'db',
          subtype: 'dynamodb',
          action: 'DeleteItem',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'deleteItem produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'DynamoDB DeleteTable elasticapmtest-table-3',
          type: 'db',
          subtype: 'dynamodb',
          action: 'DeleteTable',
          context: {
            service: { target: { type: 'dynamodb', name: AWS_REGION } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: `dynamodb/${AWS_REGION}`,
              },
            },
            db: {
              instance: AWS_REGION,
              type: 'dynamodb',
            },
          },
          outcome: 'success',
        },
        'deleteTable produced expected span',
      );

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
  {
    name: '@aws-sdk/client-dynamodb ESM',
    script: 'fixtures/use-client-dynamodb.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: 'us-east-2',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;

      const span = events.shift().span;
      t.equal(span.parent_id, tx.id, 'span.parent_id');
      t.equal(span.name, 'DynamoDB ListTables', 'span.name');

      t.equal(events.length, 0, 'all events accounted for');
    },
  },
];

test('@aws-sdk/client-dynamodb fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
