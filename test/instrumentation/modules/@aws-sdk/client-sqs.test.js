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

const { validateSpan } = require('../../../_validate_schema');
const { runTestFixtures, sortApmEvents } = require('../../../_utils');
const { NODE_VER_RANGE_IITM_GE14 } = require('../../../testconsts');

const localstackHost = process.env.LOCALSTACK_HOST || 'localhost:4566';
const localstackHostname = localstackHost.split(':')[0];
const endpoint = 'http://' + localstackHost;

const testFixtures = [
  {
    name: 'simple SQS V3 usage scenario',
    script: 'fixtures/use-client-sqs.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: 'us-east-2',
      TEST_QUEUE_NAME: 'elasticapmtest-queue-1',
    },
    versionRanges: {
      node: '>=14',
    },
    verbose: false,
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

      // Keep IDs for link assertions
      const sendMessageSpanId = spans[0].id;
      const sendMessagesBatchSpanId = spans[1].id;

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

      t.deepEqual(
        spans.shift(),
        {
          name: 'SQS SEND to elasticapmtest-queue-1.fifo',
          type: 'messaging',
          subtype: 'sqs',
          action: 'send',
          context: {
            service: {
              target: { type: 'sqs', name: 'elasticapmtest-queue-1.fifo' },
            },
            destination: {
              address: localstackHostname,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'sqs/elasticapmtest-queue-1.fifo',
              },
            },
            message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
          },
          outcome: 'success',
        },
        'sendMessage',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SQS SEND_BATCH to elasticapmtest-queue-1.fifo',
          type: 'messaging',
          subtype: 'sqs',
          action: 'send_batch',
          context: {
            service: {
              target: { type: 'sqs', name: 'elasticapmtest-queue-1.fifo' },
            },
            destination: {
              address: localstackHostname,
              port: 4566,
              cloud: { region: 'us-east-2' },
              service: {
                type: '',
                name: '',
                resource: 'sqs/elasticapmtest-queue-1.fifo',
              },
            },
            message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
          },
          outcome: 'success',
        },
        'sendMessageBatch',
      );

      // There will be one or more `SQS POLL ...` spans for the ReceiveMessage
      // API calls until all messages are retrieved -- with interspersed
      // `SQS DELETE_BATCH ...` spans to delete those messages as they are
      // received.
      const spanLinks = [];

      while (spans.length > 0) {
        const currSpan = spans.shift();

        if (currSpan.name.startsWith('SQS POLL')) {
          let numSpanLinks = 0;

          if (currSpan.links) {
            numSpanLinks = currSpan.links.length;
            spanLinks.push(...currSpan.links);
            delete currSpan.links;
          }

          t.deepEqual(
            currSpan,
            {
              name: 'SQS POLL from elasticapmtest-queue-1.fifo',
              type: 'messaging',
              subtype: 'sqs',
              action: 'poll',
              context: {
                service: {
                  target: {
                    type: 'sqs',
                    name: 'elasticapmtest-queue-1.fifo',
                  },
                },
                destination: {
                  address: localstackHostname,
                  port: 4566,
                  cloud: { region: 'us-east-2' },
                  service: {
                    type: '',
                    name: '',
                    resource: 'sqs/elasticapmtest-queue-1.fifo',
                  },
                },
                message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
              },
              outcome: 'success',
            },
            `receiveMessage (${numSpanLinks} span links)`,
          );
        } else if (currSpan.name.startsWith('SQS DELETE_BATCH')) {
          t.deepEqual(
            currSpan,
            {
              name: 'SQS DELETE_BATCH from elasticapmtest-queue-1.fifo',
              type: 'messaging',
              subtype: 'sqs',
              action: 'delete_batch',
              context: {
                service: {
                  target: {
                    type: 'sqs',
                    name: 'elasticapmtest-queue-1.fifo',
                  },
                },
                destination: {
                  address: localstackHostname,
                  port: 4566,
                  cloud: { region: 'us-east-2' },
                  service: {
                    type: '',
                    name: '',
                    resource: 'sqs/elasticapmtest-queue-1.fifo',
                  },
                },
                message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
              },
              outcome: 'success',
            },
            'deleteMessageBatch',
          );
        } else {
          break;
        }
      }

      t.deepEqual(
        spanLinks,
        [
          { trace_id: tx.trace_id, span_id: sendMessageSpanId },
          { trace_id: tx.trace_id, span_id: sendMessagesBatchSpanId },
          { trace_id: tx.trace_id, span_id: sendMessagesBatchSpanId },
        ],
        'collected span.links',
      );

      t.equal(
        spans.length,
        0,
        `all spans accounted for, remaining spans: ${JSON.stringify(spans)}`,
      );
    },
  },
  {
    name: 'simple SQS V3 with ESM',
    script: 'fixtures/use-client-sqs.mjs',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: 'us-east-2',
      TEST_QUEUE_NAME: 'elasticapmtest-queue-2',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM_GE14,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;
      const spans = events
        .filter((e) => e.span && e.span.type !== 'external')
        .map((e) => e.span);

      const span = spans.shift();
      t.equal(span.parent_id, tx.id, 'span.parent_id');
      t.equal(
        span.name,
        'SQS SEND to elasticapmtest-queue-2.fifo',
        'span.name',
      );

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
];

test('@aws-sdk/client-sqs fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
