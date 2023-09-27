/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small subset of "./use-client-sns.js". Mainly this is to test that
// instrumentation of @aws-sdk/client-sns in an ES module works.
// See "./use-client-sns.js" for more details.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/cassamdra-driver/fixtures/use-cassandra-driver.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'

import assert from 'assert';

import { Client } from 'cassandra-driver';

/**
 * @param {import('cassandra-driver').Client} client
 * @param {any} options
 */
async function useCassandraClient(client) {
  const log = apm.logger.child({ 'event.module': 'cassandra-driver-esm' });

  await new Promise((resolve, reject) => {
    client.connect((err) => (err ? reject(err) : resolve()));
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver client command',
    );
  });
  log.info({}, 'connect');

  const data = await client.execute('SELECT key FROM system.local');
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver exec command with promise',
  );
  log.info({ data }, 'execute with promise');
}

function main() {
  const contactPoints = [process.env.CASSANDRA_HOST || 'localhost'];
  const localDataCenter = process.env.TEST_DATACENTER || 'datacenter1';
  const client = new Client({
    contactPoints,
    localDataCenter,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useCassandraClient(client).then(
    async function () {
      tx.end();
      await client.shutdown();
      process.exitCode = 0;
    },
    async function (err) {
      apm.logger.error(err, 'useCassandraClient rejected');
      tx.setOutcome('failure');
      tx.end();
      await client.shutdown();
      process.exitCode = 1;
    },
  );
}

main();
