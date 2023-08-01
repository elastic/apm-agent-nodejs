/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'cassandra-driver' package.
//
// This assumes a Cassandra server running on localhost. You can use:
//    npm run docker:start cassandra
// to start a Cassandra docker container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-cassandra-driver',
  logUncaughtExceptions: true,
});

const cassandra = require('cassandra-driver');

const KEYSPACE = 'tracecassandradriver';
const TABLE = 'testtable';
let client;

async function run() {
  let res;

  client = new cassandra.Client({
    contactPoints: ['localhost'],
    localDataCenter: 'datacenter1',
  });
  await client.connect();
  res = await client.execute('SELECT key FROM system.local');
  console.log('select result:', res);

  // Create a keyspace and table in which to play.
  await client.execute(`
    CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE} WITH replication = {
      'class': 'SimpleStrategy',
      'replication_factor': 1
    };
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${KEYSPACE}.${TABLE}(id uuid,text varchar,PRIMARY KEY(id));
  `);

  // Make a new client in our now-existing keyspace.
  await client.shutdown();
  client = new cassandra.Client({
    contactPoints: ['localhost'],
    localDataCenter: 'datacenter1',
    keyspace: KEYSPACE,
  });

  // Play in this keyspace and table.
  const sqlInsert = `INSERT INTO ${TABLE} (id, text) VALUES (uuid(), ?)`;
  res = await client.batch([
    { query: sqlInsert, params: ['foo'] },
    { query: sqlInsert, params: ['bar'] },
    { query: sqlInsert, params: ['foo'] },
  ]);
  console.log('batch insert result:', res);

  function useEachRow() {
    console.log('-- client.eachRow');
    // `eachRow` doesn't provide a Promise interface, so we promisify ourselves.
    return new Promise((resolve, reject) => {
      client.eachRow(
        `SELECT id, text FROM ${TABLE} WHERE text=? ALLOW FILTERING`,
        ['foo'],
        (n, row) => {
          console.log('row %d: %j', n, row);
        },
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
      );
    });
  }
  await useEachRow();

  console.log('-- client.stream');
  const q = client.stream(
    `SELECT id, text FROM ${TABLE} WHERE text=? ALLOW FILTERING`,
    ['foo'],
  );
  for await (const row of q) {
    console.log('row: %j', row);
  }

  await client.execute(`DROP TABLE ${TABLE}`);
}

// For tracing spans to be created, there must be an active APM transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1');

run()
  .catch((err) => {
    console.warn('run err:', err);
  })
  .finally(() => {
    if (client) {
      client.shutdown();
    }
    t1.end();
  });
