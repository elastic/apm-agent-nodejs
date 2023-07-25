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
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

const LOCALSTACK_HOST = process.env.LOCALSTACK_HOST || 'localhost';
const endpoint = 'http://' + LOCALSTACK_HOST + ':4566';

const testFixtures = [
  {
    name: 'simple S3 V3 usage scenario',
    script: 'fixtures/use-client-s3.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_BUCKET_NAME: 'elasticapmtest-bucket-3',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: 'us-east-2',
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
      const failingSpanId = spans[8].id; // index of `getObjNonExistantObject`
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

      // Work through each of the pipeline functions (listAppBuckets,
      // createTheBucketIfNecessary, ...) in the script:
      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 ListBuckets',
          type: 'storage',
          subtype: 's3',
          action: 'ListBuckets',
          context: {
            service: { target: { type: 's3' } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: { type: '', name: '', resource: 's3' },
            },
            http: { status_code: 200, response: { encoded_body_size: 222 } },
          },
          outcome: 'success',
        },
        'listAllBuckets produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 CreateBucket elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'CreateBucket',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 200, response: { encoded_body_size: 61 } },
          },
          otel: {
            attributes: { 'aws.s3.bucket': 'elasticapmtest-bucket-3' },
          },
          outcome: 'success',
        },
        'createTheBucketIfNecessary produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 HeadBucket elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'HeadBucket',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 200, response: { encoded_body_size: 0 } },
          },
          otel: {
            attributes: { 'aws.s3.bucket': 'elasticapmtest-bucket-3' },
          },
          outcome: 'success',
        },
        'waitForBucketToExist produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 PutObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'PutObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 200, response: { encoded_body_size: 58 } },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt',
            },
          },
          outcome: 'success',
        },
        'createObj produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 HeadObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'HeadObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 200, response: { encoded_body_size: 8 } },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt',
            },
          },
          outcome: 'success',
        },
        'waitForObjectToExist produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 GetObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 200, response: { encoded_body_size: 8 } },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt',
            },
          },
          outcome: 'success',
        },
        'getObj produced expected span',
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
          name: 'S3 GetObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 304 },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt',
            },
          },
          outcome: 'success',
        },
        'getObjConditionalGet produced expected span',
      );

      // This is the GetObject to a non-existant-key, so we expect a failure.
      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 GetObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 404 },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt-does-not-exist',
            },
          },
          outcome: 'failure',
        },
        'getObjNonExistantObject produced expected span',
      );
      t.equal(errors.length, 1, 'got 1 error');
      t.equal(
        errors[0].parent_id,
        failingSpanId,
        'error is a child of the failing span from getObjNonExistantObject',
      );
      t.equal(errors[0].transaction_id, tx.id, 'error.transaction_id');
      t.equal(errors[0].exception.type, 'NoSuchKey', 'error.exception.type');

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 DeleteObject elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteObject',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 204 },
          },
          otel: {
            attributes: {
              'aws.s3.bucket': 'elasticapmtest-bucket-3',
              'aws.s3.key': 'aDir/aFile.txt',
            },
          },
          outcome: 'success',
        },
        'deleteTheObj produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'S3 DeleteBucket elasticapmtest-bucket-3',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteBucket',
          context: {
            service: {
              target: { type: 's3', name: 'elasticapmtest-bucket-3' },
            },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'elasticapmtest-bucket-3',
              },
            },
            http: { status_code: 204 },
          },
          otel: {
            attributes: { 'aws.s3.bucket': 'elasticapmtest-bucket-3' },
          },
          outcome: 'success',
        },
        'deleteTheBucketIfCreatedIt produced expected span',
      );

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
  {
    name: '@aws-sdk/client-s3 ESM',
    script: 'fixtures/use-client-s3.mjs',
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
      t.equal(span.name, 'S3 ListBuckets', 'span.name');

      t.equal(events.length, 0, 'all events accounted for');
    },
  },
];

test('@aws-sdk/client-s3 fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
