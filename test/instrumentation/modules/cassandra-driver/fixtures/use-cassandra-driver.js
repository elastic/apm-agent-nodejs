/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false,
});
const semver = require('semver');
const cassandra = require('cassandra-driver');
const version = require('cassandra-driver/package.json').version;
const assert = require('assert');
const hasPromises = semver.satisfies(version, '>=3.2');


/**
 * @param {import('cassandra-driver').Client} client
 * @param {any} options
 */
async function useCassandraClient(client, options) {
  // TOOD: smart stuff here
  const { table } = options;
  const log = apm.logger.child({
    'event.module': 'cassandra-driver',
  });

  // 3.x only works with callbacks
  await new Promise((resolve, reject) => {
    client.connect((err) => (err ? reject(err) : resolve()));
  });
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver client command',
  );

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#execute
  const executeSql = 'SELECT key FROM system.local';
  // const summary = 'SELECT FROM system.local';

  client.execute(executeSql, function (err, result) {
    assert(!err, 'no error in execute');
    assert(result.rows.length === 1, 'number of rows in execute');
    assert(result.rows[0].key === 'local', 'result key in execute');
  });
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver exec command with callback',
  );

  if (hasPromises) {
    const result = await client.execute(executeSql);

    assert(result.rows.length === 1, 'number of rows in awaited execute');
    assert(result.rows[0].key === 'local', 'result key in awaited execute');
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver exec command with promise',
    );
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#batch
  const batchSql = `INSERT INTO ${table} (id, text) VALUES (uuid(), ?)`;
  const queries = [
    { query: batchSql, params: ['foo'] },
    { query: batchSql, params: ['bar'] },
  ];
  // const summary = 'Cassandra: Batch query';

  client.batch(queries, function (err) {
    assert(!err, 'no error on batch callback');
  });
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver batch command with callback',
  );

  if (hasPromises) {
    await client.batch(queries);

    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver batch command with promise',
    );
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#each-row
  client.eachRow(
    'SELECT key FROM system.local',
    [],
    (index, row) => assert(row.key === 'local', 'orw key is correct'),
    (err) => assert(!err, 'no error in eachRow method'),
  );

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#stream
  const stream = client.stream('SELECT key FROM system.local', []);
  let rows = 0;
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  stream.on('readable', function () {
    let row;
    while ((row = this.read())) {
      rows++;
      assert(row.key === 'local', 'row key is correct on stream');
    }
  });

  stream.on('error', function (err) {
    assert(!err, 'no error in the stream');
  });

  stream.on('end', function () {
    assert(rows === 1, 'number of rows is correct at the end of the stream');
    deferred.resolve();
  });

  await deferred.promise;
}

function main() {
  const keyspace = process.env.TEST_KEYSPACE || 'keyspace1';
  const table = process.env.TEST_TABLE || 'table1';
  const client = new cassandra.Client({
    contactPoints: [process.env.CASSANDRA_HOST || 'localhost'],
    localDataCenter: process.env.TEST_DATACENTER || 'datacenter1',
    keyspace,
    table,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useCassandraClient(client, { keyspace, table }).then(
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
