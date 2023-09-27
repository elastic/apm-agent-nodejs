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
const assert = require('assert');
const cassandra = require('cassandra-driver');

/**
 * @param {import('cassandra-driver').Client} client
 * @param {any} options
 */
async function useCassandraClient(client, options) {
  const { testForPromises, keyspace, table } = options;
  const log = apm.logger.child({ 'event.module': 'cassandra-driver' });
  const SELECT_QUERY = 'SELECT key FROM system.local';
  const INSERT_QUERY = `INSERT INTO ${table} (id, text) VALUES (uuid(), ?)`;
  let data;

  // NOTE: cassandra has some differences in their APIs
  // - some of them are completelly callbackl based (connect, eachRow)
  // - from v3.2 some retunr a promise if no callback provided
  //
  // to have a deterministic order of spans we should `await` the callbacks
  // so we wrap them into a promise.
  await new Promise((resolve, reject) => {
    client.connect((err) => (err ? reject(err) : resolve()));
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver client command',
    );
  });
  log.info({}, 'connect');

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#execute
  // NOTE: this 1st chain of executions is to setup the DB but also is used
  // to test other queries than the SELECT ones
  await new Promise((resolve, reject) => {
    const query = `CREATE KEYSPACE IF NOT EXISTS ${keyspace} WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': 1 };`;

    client.execute(query, function (err) {
      if (err) {
        reject(err);
      } else {
        log.info({ query }, 'create keyspace');
        resolve();
      }
    });
  })
    .then(() => {
      const query = `USE ${keyspace}`;

      return new Promise((resolve, reject) => {
        client.execute(query, function (err) {
          if (err) {
            reject(err);
          } else {
            log.info({ query }, 'create table');
            resolve();
          }
        });
      });
    })
    .then(() => {
      const query = `CREATE TABLE IF NOT EXISTS ${keyspace}.${table}(id uuid,text varchar,PRIMARY KEY(id));`;

      return new Promise((resolve, reject) => {
        client.execute(query, function (err) {
          if (err) {
            reject(err);
          } else {
            log.info({ query }, 'create table');
            resolve();
          }
        });
      });
    });

  // We cannot await executions in callback mode so we wrap it in a Promise
  // and pass the data for assertions to the next block
  await new Promise((resolve, reject) => {
    client.execute(SELECT_QUERY, function (err, data) {
      if (err) {
        reject(err);
      } else {
        log.info({ data }, 'execute with callback');
        resolve();
      }
    });
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver exec command with callback',
    );
  });

  if (testForPromises) {
    data = await client.execute(SELECT_QUERY);
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver exec command with promise',
    );
    log.info({ data }, 'execute with promise');
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#batch
  const queries = [
    { query: INSERT_QUERY, params: ['foo'] },
    { query: INSERT_QUERY, params: ['bar'] },
  ];

  // Batch also has callback mode so we wrap it to be able to await its execution
  await new Promise((resolve, reject) => {
    client.batch(queries, function (err, data) {
      if (err) {
        reject(err);
      } else {
        log.info({ data }, 'batch with callback');
        resolve();
      }
    });
    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver batch command with callback',
    );
  });

  if (testForPromises) {
    data = await client.batch(queries);

    assert(
      apm.currentSpan === null,
      'no currentSpan in sync code after cassandra-driver batch command with promise',
    );
    log.info({ data }, 'batch with promise');
  }

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#each-row
  await new Promise((resolve, reject) => {
    client.eachRow(
      SELECT_QUERY,
      [],
      function assertRow(i, r) {
        if (r.key !== 'local') {
          reject(`Row key value is not "local" (${r.key})`);
        }
      },
      function (err, data) {
        if (err) {
          reject(err);
        } else {
          log.info({ data }, 'eachRow');
          resolve();
        }
      },
    );
  });

  // https://docs.datastax.com/en/developer/nodejs-driver/4.6/api/class.Client/#stream
  await new Promise((resolve, reject) => {
    const stream = client.stream(SELECT_QUERY, []);
    let rows = 0;

    stream.on('readable', function () {
      let row;
      while ((row = this.read())) {
        rows++;
        if (row.key !== 'local') {
          reject(
            `row key ${row.key} is not correct on stream (expected 'local')`,
          );
        }
      }
    });

    stream.on('error', function (err) {
      if (err) {
        reject(err);
      }
    });

    stream.on('end', function () {
      if (rows !== 1) {
        reject(`number of rows (${rows}) is correct at the end of the stream`);
      } else {
        resolve();
      }
    });
  });
}

function main() {
  const contactPoints = [process.env.CASSANDRA_HOST || 'localhost'];
  const localDataCenter = process.env.TEST_DATACENTER || 'datacenter1';
  const keyspace = process.env.TEST_KEYSPACE || 'keyspace1';
  const table = process.env.TEST_TABLE || 'table1';
  const testForPromises = process.env.TEST_USE_PROMISES === 'true';
  const client = new cassandra.Client({
    contactPoints,
    localDataCenter,
    table,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useCassandraClient(client, { testForPromises, keyspace, table }).then(
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
