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

const kafkaHost = process.env.KAFKA_HOST || 'localhost:9093';

const rand = Math.floor(Math.random() * 1000);
const kafkaTopic = `elasticapmtest-topic-each-${rand}`;

// this map will be used to stash data to be used among different tests
const store = new Map();

/** @type {import('../../../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'simple Kafkajs usage scenario for single message processing',
    script: 'fixtures/use-kafkajs-each-message.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);
      const tx = events.shift().transaction;

      // First the transaction.
      t.ok(tx, 'got the send transaction');

      // Compare some common fields across all spans.
      // ignore http/external spans
      const spans = events.filter((e) => e.span).map((e) => e.span);
      const parentId = spans[0].id;
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
        name: `Kafka SEND to ${kafkaTopic}`,
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: {
            target: { type: 'kafka', name: kafkaTopic },
          },
          destination: {
            service: {
              resource: `kafka/${kafkaTopic}`,
              type: '',
              name: '',
            },
          },
          message: { queue: { name: kafkaTopic } },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // Now check the transactions created for each message received
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);

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

      // Check message handling transactions.
      // Headers should be captured by default and redacted
      // according to the default value of `sanitizeFieldNames`
      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
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
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
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
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
            headers: {
              auth: '[REDACTED]',
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
    name: 'simple Kafkajs usage scenario for batch message processing with a single topic not ignored',
    script: 'fixtures/use-kafkajs-each-batch.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      TEST_IGNORE_TOPIC: 'true',
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
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

      // The 1st batch has only one topic which is not ignored
      // so the span has message context and also
      // - service.target.name
      // - destination.service.resource
      t.deepEqual(spans.shift(), {
        name: `Kafka SEND to ${kafkaTopic}`,
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: { target: { type: 'kafka', name: kafkaTopic } },
          destination: {
            service: { type: '', name: '', resource: `kafka/${kafkaTopic}` },
          },
          message: { queue: { name: kafkaTopic } },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // Now check the transactions created
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);

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
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: { framework: { name: 'Kafka' } },
          message: { queue: { name: kafkaTopic } },
        },
        links: [
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
  {
    name: 'simple Kafkajs usage scenario for batch message processing without ignored topics',
    script: 'fixtures/use-kafkajs-each-batch.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      TEST_IGNORE_TOPIC: 'false',
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
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
        name: `Kafka SEND`,
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: { target: { type: 'kafka' } },
          destination: {
            service: { type: '', name: '', resource: 'kafka' },
          },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // Now check the transactions created
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction)
        // We cannot ensure the order of the received batches so we have to sort
        // to do the assertions properly
        .sort((ta, tb) => {
          return ta.name < tb.name ? -1 : 1;
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
      });

      // Check message handling transactions
      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: { framework: { name: 'Kafka' } },
          message: { queue: { name: kafkaTopic } },
        },
        links: [
          {
            trace_id: tx.trace_id,
            span_id: spanId,
          },
        ],

        outcome: 'success',
      });

      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${kafkaTopic}-ignore`,
        type: 'messaging',
        context: {
          service: { framework: { name: 'Kafka' } },
          message: { queue: { name: `${kafkaTopic}-ignore` } },
        },
        links: [
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
  {
    name: 'simple Kafkajs usage scenario for `captureHeaders=false` and `captureBody=all` on message reception',
    script: 'fixtures/use-kafkajs-each-message.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      ELASTIC_APM_CAPTURE_HEADERS: 'false',
      ELASTIC_APM_CAPTURE_BODY: 'all',
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
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
        name: `Kafka SEND to ${kafkaTopic}`,
        type: 'messaging',
        subtype: 'kafka',
        action: 'send',
        context: {
          service: {
            target: { type: 'kafka', name: kafkaTopic },
          },
          destination: {
            service: {
              resource: `kafka/${kafkaTopic}`,
              type: '',
              name: '',
            },
          },
          message: { queue: { name: kafkaTopic } },
        },
        outcome: 'success',
      });

      t.equal(spans.length, 0, 'all spans accounted for');

      // Now check the transactions created for each message received
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

      // NOTE: messages could arrive in different order so we sort them
      // to properly do the assertions
      transactions.sort((t1, t2) => {
        const body1 = t1.context.message.body || 'undefined';
        const body2 = t2.context.message.body || 'undefined';
        return body1 < body2 ? -1 : 1;
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
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
            body: 'each message 1',
          },
        },
        outcome: 'success',
      });

      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
            body: 'each message 2',
          },
        },
        outcome: 'success',
      });

      t.deepEqual(transactions.shift(), {
        name: `Kafka RECEIVE from ${kafkaTopic}`,
        type: 'messaging',
        context: {
          service: {},
          message: {
            queue: { name: kafkaTopic },
            body: 'each message 3',
          },
        },
        outcome: 'success',
      });
      t.equal(transactions.length, 0, 'all transactions accounted for');
    },
  },
  {
    name: 'simple Kafkajs usage scenario of context propagation while sending messages',
    script: 'fixtures/use-kafkajs-ctx-propagation.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      TEST_MODE: 'send',
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);
      const tx = events.shift().transaction;

      // First the transaction.
      t.ok(tx, 'got the send transaction');

      // Stash the trace context data to use it on the assertions of the next test
      store.set('ctx-propagation-parent-id', tx.id);
      store.set('ctx-propagation-trace-id', tx.trace_id);

      // Check topic is ignored
      const spans = events.filter((e) => e.span).map((e) => e.span);
      t.equal(spans.length, 0, 'there are no spans');
    },
  },
  {
    name: 'simple Kafkajs usage scenario of context propagation while consuming messages',
    script: 'fixtures/use-kafkajs-ctx-propagation.js',
    cwd: __dirname,
    timeout: 20000,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_GROUP_ID: `elastictest-kafka-group-${rand}`,
      TEST_TOPIC: kafkaTopic,
      TEST_KAFKA_HOST: kafkaHost,
      TEST_MODE: 'consume',
      // Suppres warinings about new default partitioner
      // https://kafka.js.org/docs/migration-guide-v2.0.0#producer-new-default-partitioner
      KAFKAJS_NO_PARTITIONER_WARNING: '1',
    },
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      // Consuming does not generate spans
      const spans = events.filter((e) => e.span).map((e) => e.span);
      t.equal(spans.length, 0, 'there are no spans');

      // Gat stashed data from previous test
      const traceId = store.get('ctx-propagation-trace-id');
      const parentId = store.get('ctx-propagation-parent-id');

      // Check the transactions fo consuming messages have the proper trace
      const transactions = events
        .filter((e) => e.transaction)
        .map((e) => e.transaction);

      t.ok(
        transactions.every((t) => t.trace_id === traceId),
        'all transactions have the right trace_id',
      );

      t.ok(
        transactions.every((t) => t.parent_id === parentId),
        'all transactions have the right parent_id',
      );

      t.ok(
        transactions.every((t) => {
          const traceparent = t.context.message.headers.traceparent;
          return traceparent === `00-${t.trace_id}-${parentId}-01`;
        }),
        'all transactions have the right traceparent header',
      );

      t.ok(
        transactions.every((t) => {
          const tracestate = t.context.message.headers.tracestate;
          return tracestate === 'es=s:1';
        }),
        'all transactions have the right tracestate header',
      );

      t.equal(transactions.length, 2, 'get the right amount of transactions');
    },
  },
];

test('kafkajs fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
