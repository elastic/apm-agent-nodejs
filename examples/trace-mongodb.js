/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'mongodb' package.
//
// This assumes a MongoDB server running on localhost. You can use:
//    npm run docker:start mongodb
// to start a MongoDB docker container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-mongodb',
  logUncaughtExceptions: true,
});

const MongoClient = require('mongodb').MongoClient;

const DB_NAME = 'example-trace-mongodb';
const url = 'mongodb://localhost:27017';

async function main() {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because this script is not running
  // an HTTP server, we manually start a transaction. More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const t1 = apm.startTransaction('t1');

  const client = new MongoClient(url);
  try {
    await client.connect();

    const database = client.db(DB_NAME);
    const coll = database.collection('breakfast');

    let res = await coll.insertMany([
      { item: 'spam', n: 0 },
      { item: 'ham', n: 1 },
      { item: 'eggs', n: 2 },
    ]);
    console.log('insertMany:', res);

    res = await coll.findOne({ item: 'eggs' });
    console.log('findOne eggs:', res);

    await coll.deleteMany({});

    res = await coll.findOne({ item: 'eggs' });
    console.log('findOne eggs:', res);
  } finally {
    await client.close();
    t1.end();
  }
}

main();
