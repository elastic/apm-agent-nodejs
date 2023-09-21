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
const { promisify } = require('util');
const assert = require('assert');
const cassandra = require('cassandra-driver');

/**
 * @param {import('cassandra-driver').Client} client
 * @param {any} options
 */
async function useCassandraClient(client, options) {
  // TOOD: smart stuff here
  const { table, canReturnPromises } = options;
  const log = apm.logger.child({ 'event.module': 'cassandra-driver' });
  const selectQuery = 'SELECT key FROM system.local';
  const insertQuery = `INSERT INTO ${table} (id, text) VALUES (uuid(), ?)`;
  let data;

  // 3.x only works with callbacks
  await new Promise((resolve, reject) => {
    client.connect((err) => (err ? reject(err) : resolve()));
  });
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver client command',
  );
  log.info({}, 'connect');

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#execute
  // XXX: since this code is not blocking we are kind of running this query
  // in parallel with the next one and may change the order of the spans
  // so we "promisify" it to be able to await
  // other option may be use the deferred pattern

  // XXX: the non-promisified version (with racing conditions)
  client.execute(selectQuery, function (err, data) {
    assert(!err, 'no error in execute');
    assert(data.rows.length === 1, 'number of rows in execute');
    assert(data.rows[0].key === 'local', 'result key in execute');
    log.info({ data }, 'execute with callback');
  });
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver exec command with callback',
  );

  // XXX: the "promisified" version. The necessary `bind` be dstracting
  data = await promisify(client.execute.bind(client))(selectQuery);
  assert(data.rows.length === 1, 'number of rows in execute');
  assert(data.rows[0].key === 'local', 'result key in execute');
  log.info({ data }, 'execute with callback');
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver exec command with callback',
  );

  // XXX: the "deferred" version
  const execDefer = getDeferred();
  client.execute(selectQuery, function (err, data) {
    try {
      assert(!err, 'no error in execute');
      assert(data.rows.length === 1, 'number of rows in execute');
      assert(data.rows[0].key === 'local', 'result key in execute');
      log.info({ data }, 'execute with callback');
      execDefer.resolve();
    } catch (ex) {
      log.info({ err }, 'execute with callback error');
      execDefer.reject(err);
    }
  });
  await execDefer.promise;
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver exec command with callback',
  );

  if (canReturnPromises) {
    data = await client.execute(selectQuery);

    assert(data.rows.length === 1, 'number of rows in awaited execute');
    assert(data.rows[0].key === 'local', 'rows key in awaited execute');
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver exec command with promise',
    );
    log.info({ data }, 'execute with promise');
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#batch
  const queries = [
    { query: insertQuery, params: ['foo'] },
    { query: insertQuery, params: ['bar'] },
  ];

  data = await promisify(client.batch.bind(client))(queries);
  log.info({ data }, 'batch with callback');
  assert(
    apm.currentSpan === null,
    'no currentSpan in sync code after cassandra-driver batch command with callback',
  );

  // XXX: same here, should we use promisify?
  // client.batch(queries, function (err, data) {
  //   assert(!err, 'no error on batch callback');
  //   log.info({ data }, 'batch with callback');
  // });
  // assert(
  //   apm.currentSpan === null,
  //   'no currentSpan in sync code after cassandra-driver batch command with callback',
  // );

  if (canReturnPromises) {
    data = await client.batch(queries);

    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver batch command with promise',
    );
    log.info({ data }, 'batch with promise');
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#each-row
  const assertRow = (i, r) => assert(r.key === 'local', 'row key is correct');

  // XXX: same here
  client.eachRow(selectQuery, [], assertRow, (err, data) => {
    console.log(err);
    assert(!err, 'no error in eachRow method');
    log.info({ data }, 'eachRow');
  });

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#stream
  // const stream = client.stream(selectQuery, []);
  // let rows = 0;

  // stream.on('readable', function () {
  //   let row;
  //   while ((row = this.read())) {
  //     rows++;
  //     assert(row.key === 'local', 'row key is correct on stream');
  //   }
  // });

  // stream.on('error', function (err) {
  //   assert(!err, 'no error in the stream');
  // });

  // stream.on('end', function () {
  //   assert(rows === 1, 'number of rows is correct at the end of the stream');
  // });
}

/**
 * Returns an object which holds refs to a new promise callbacks
 * @returns {{ resolve: (val: any) => void; reject: (err: any) => void; promise: Promise<any> }}
 */
function getDeferred() {
  const deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}

function main() {
  const contactPoints = [process.env.CASSANDRA_HOST || 'localhost'];
  const localDataCenter = process.env.TEST_DATACENTER || 'datacenter1';
  const keyspace = process.env.TEST_KEYSPACE || 'keyspace1';
  const table = process.env.TEST_TABLE || 'table1';
  const canReturnPromises = process.env.TEST_USE_PROMISES;
  const client = new cassandra.Client({
    contactPoints,
    localDataCenter,
    keyspace,
    table,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useCassandraClient(client, { table, canReturnPromises }).then(
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
