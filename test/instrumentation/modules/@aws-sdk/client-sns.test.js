/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test SNS instrumentation of the '@aws-sdk/client-sns' module.
//
// Note that this uses localstack for testing, which mimicks the SNS API but
// isn't identical. Some known limitations:
// TODO: check if there are limitations

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
    name: 'simple SNS V3 usage scenario',
    script: 'fixtures/use-client-sns.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    env: {
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_TOPIC_NAME: 'elasticapmtest-topic-3',
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
      const failingSpanId = spans[2].id; // index of `Publish` to a non exixtent topic
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
          name: 'SNS Publish to <PHONE_NUMBER>',
          type: 'messaging',
          subtype: 'sns',
          action: 'Publish',
          context: {
            service: {
              target: { type: 'sns', name: '<PHONE_NUMBER>' },
            },
            destination: {
              service: { name: '', type: '', resource: 'sns/<PHONE_NUMBER>' },
              address: 'localhost',
              port: 4566,
              cloud: { region: 'us-east-2' },
            },
            message: { queue: { name: '<PHONE_NUMBER>' } },
          },
          outcome: 'success',
        },
        'publish to PHONE_NUMBER produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SNS Publish to elasticapmtest-topic-3',
          type: 'messaging',
          subtype: 'sns',
          action: 'Publish',
          context: {
            service: {
              target: { type: 'sns', name: 'elasticapmtest-topic-3' },
            },
            destination: {
              service: {
                name: '',
                type: '',
                resource: 'sns/elasticapmtest-topic-3',
              },
              address: 'localhost',
              port: 4566,
              cloud: { region: 'us-east-2' },
            },
            message: { queue: { name: 'elasticapmtest-topic-3' } },
          },
          outcome: 'success',
        },
        'publish to topic produced expected span',
      );

      t.deepEqual(
        spans.shift(),
        {
          name: 'SNS Publish to elasticapmtest-topic-3-unexistent',
          type: 'messaging',
          subtype: 'sns',
          action: 'Publish',
          context: {
            service: {
              target: {
                type: 'sns',
                name: 'elasticapmtest-topic-3-unexistent',
              },
            },
            destination: {
              service: {
                name: '',
                type: '',
                resource: 'sns/elasticapmtest-topic-3-unexistent',
              },
              address: 'localhost',
              port: 4566,
              cloud: { region: 'us-east-2' },
            },
            message: { queue: { name: 'elasticapmtest-topic-3-unexistent' } },
          },
          outcome: 'failure',
        },
        'publish to unexistent topic produced expected span',
      );

      // This is the Publish to a non-existant-topic, so we expect a failure.
      t.equal(errors.length, 1, 'got 1 error');
      t.equal(
        errors[0].parent_id,
        failingSpanId,
        'error is a child of the failing span from publish to a non existant topic',
      );
      t.equal(errors[0].transaction_id, tx.id, 'error.transaction_id');
      t.equal(
        errors[0].exception.type,
        'NotFoundException',
        'error.exception.type',
      );

      t.equal(spans.length, 0, 'all spans accounted for');
    },
  },
  {
    name: '@aws-sdk/client-sns ESM',
    script: 'fixtures/use-client-sns.mjs',
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
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);

      t.ok(events[0].transaction, 'got the transaction');
      const tx = events.shift().transaction;

      const span = events.shift().span;
      t.equal(span.parent_id, tx.id, 'span.parent_id');
      t.equal(span.name, 'SNS Publish to <PHONE_NUMBER>', 'span.name');

      t.equal(events.length, 0, 'all events accounted for');
    },
  },
];

test('@aws-sdk/client-sns fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
