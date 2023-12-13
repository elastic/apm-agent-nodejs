/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test instrumentation of the 'kafkajs' module.

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const test = require('tape');

const { validateSpan } = require('../../../_validate_schema');
const { runTestFixtures, sortApmEvents } = require('../../../_utils');
// const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

const kafkaUrl = process.env.KAFKA_URL || 'localhost:9093';

const version = process.version.replace(/\./g, '-');
const topicEach = `elasticapmtest-topic-each-${version}`;
const topicBatch = `elasticapmtest-topic-batch-${version}`;

/** @type {import('../../../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'simple Kafkajs usage scenario for single message processing',
    script: 'fixtures/use-kafkajs-each-message.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${version}`,
      TEST_TOPIC: topicEach,
      TEST_KAFKA_URL: kafkaUrl,
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
    verbose: true,
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);
      const tx = events.shift().transaction;

      // First the transaction.
      t.ok(tx, 'got the send transaction');

      // Compare some common fields across all spans.
      // ignore http/external spans
      const spans = events.filter((e) => e.span).map((e) => e.span);
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

      t.deepEqual(spans.shift(), {
        name: `Kafka send to ${topicEach}`,
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: {
            target: { type: 'kafka', name: topicEach },
          },
          destination: {
            service: {
              resource: `kafka/${topicEach}`,
              type: '',
              name: '',
            },
          },
          message: { queue: { name: topicEach } },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // No check the transactions created for each message received
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);
      const parentId = transactions[0].parent_id;

      t.equal(
        transactions.filter((t) => t.trace_id === tx.trace_id).length,
        transactions.length,
        'all transactions have the same trace_id',
      );
      t.equal(
        transactions.filter((t) => t.parent_id === parentId).length,
        transactions.length,
        'all transactions have the same parent_id',
      );
      t.equal(
        transactions
          .map((t) => t.context.message.age.ms)
          .filter((ms) => typeof ms === 'number' && ms > 0).length,
        transactions.length,
        'all transactions have positive age',
      );
      // TODO: other checks like sync=false & sample rate?

      // NOTE: messages could arrive in different order so we sort them
      // to properly do the assertions
      transactions.sort((t1, t2) => {
        const header1 = t1.context.message.headers.foo || 'undefined';
        const header2 = t2.context.message.headers.foo || 'undefined';
        return header1 < header2 ? -1 : 1;
      });
      transactions.forEach((t) => {
        // Remove variable and common fields to facilitate t.deepEqual below.
        delete t.id;
        delete t.parent_id;
        delete t.trace_id;
        delete t.timestamp;
        delete t.duration;
        delete t.sample_rate;
        delete t.sampled;
        delete t.span_count;
        delete t.result;
        delete t.context.user;
        delete t.context.tags;
        delete t.context.custom;
        delete t.context.cloud;
        delete t.context.message.age;
      });

      // Check message handling transactions
      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${topicEach}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: topicEach },
            headers: {
              foo: 'buffer',
              traceparent: `00-${tx.trace_id}-${parentId}-01`,
              tracestate: 'es=s:1',
            },
          },
        },
        outcome: 'success',
      });

      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${topicEach}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: topicEach },
            headers: {
              foo: 'string',
              traceparent: `00-${tx.trace_id}-${parentId}-01`,
              tracestate: 'es=s:1',
            },
          },
        },
        outcome: 'success',
      });

      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${topicEach}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: topicEach },
            headers: {
              traceparent: `00-${tx.trace_id}-${parentId}-01`,
              tracestate: 'es=s:1',
            },
          },
        },
        outcome: 'success',
      });
      t.equal(transactions.length, 0, 'all transactions accounted for');
    },
  },
  {
    name: 'simple Kafkajs usage scenario for batch message processing',
    script: 'fixtures/use-kafkajs-each-batch.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${version}`,
      TEST_TOPIC: topicBatch,
      TEST_KAFKA_URL: kafkaUrl,
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
    verbose: true,
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);
      const tx = events.shift().transaction;

      // First the transaction.
      t.ok(tx, 'got the send batch transaction');

      // Compare some common fields across all spans.
      // ignore http/external spans
      const spans = events.filter((e) => e.span).map((e) => e.span);
      const spanId = spans[0].id;
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

      t.deepEqual(spans.shift(), {
        name: 'Kafka send messages batch',
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: { target: { type: 'kafka' } },
          destination: { service: { type: '', name: '', resource: 'kafka' } },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // No check the transactions created for each message received
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);

      // NOTE: no checks like prev test since there is only on span

      transactions.forEach((t) => {
        // Remove variable and common fields to facilitate t.deepEqual below.
        delete t.id;
        delete t.parent_id;
        delete t.trace_id;
        delete t.timestamp;
        delete t.duration;
        delete t.sample_rate;
        delete t.sampled;
        delete t.span_count;
        delete t.result;
        delete t.context.user;
        delete t.context.tags;
        delete t.context.custom;
        delete t.context.cloud;
      });

      // Check message handling transactions
      t.deepEqual(transactions.shift(), {
        name: 'Kafka RECEIVE from batch',
        type: 'messaging',
        context: {
          service: { framework: { name: 'Kafka' } },
          message: { queue: { name: topicBatch } },
        },
        links: [
          {
            trace_id: tx.trace_id,
            span_id: spanId,
          },
          {
            trace_id: tx.trace_id,
            span_id: spanId,
          },
          {
            trace_id: tx.trace_id,
            span_id: spanId,
          },
        ],

        outcome: 'success',
      });

      t.equal(transactions.length, 0, 'all transactions accounted for');
    },
  },
];

test('kafkajs fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
