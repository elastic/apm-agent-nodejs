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
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

const kafkaUrl = process.env.KAFKA_URL || 'localhost:9093';

/** @type {import('../../../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'simple Kafkajs usage scenario',
    script: 'fixtures/use-kafkajs.js',
    cwd: __dirname,
    env: {
      TEST_CLIENT_ID: 'elastic-kafka-client',
      TEST_TOPIC: 'elasticapmtest-topic-1234',
      TEST_KAFKA_URL: kafkaUrl,
    },
    checkApmServer(t, apmServer) {
      t.ok(apmServer.events[0].metadata, 'metadata');
      const events = sortApmEvents(apmServer.events);
    },
  },
];

test('kafkajs fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
