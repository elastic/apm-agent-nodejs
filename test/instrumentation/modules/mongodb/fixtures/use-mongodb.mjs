/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

import apm from '../../../../../index.js'; // 'elastic-apm-node'

import assert from 'assert';

import { MongoClient } from 'mongodb';

// ---- support functions
/**
 *
 * @param {import('mongodb').MongoClient} mongodbClient
 * @param {Record<string, string>} options
 */
async function useMongodb(mongodbClient, options) {
  const { url, db, col, useCallbacks } = options;
  const log = apm.logger.child({
    'event.module': 'app',
    url,
    database: db,
    collection: col,
    useCallbacks,
  });

  // All versions return a promise for `connect` method and
  // different types of connection are tested in a separate file
  await mongodbClient.connect();
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({}, 'connect');

  const database = mongodbClient.db(db);
  const collection = database.collection(col);
  let data;

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#findOne
  data = await collection.findOne({ a: 1 });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'findOne with promises');
}

// ---- mainline

async function main() {
  const host = process.env.TEST_HOST || '127.0.0.1';
  const port = process.env.TEST_PORT || '27017';
  const db = process.env.TEST_DB || 'elasticapm';
  const col = process.env.TEST_COLLECTION || 'test';
  const url = `mongodb://${host}:${port}`;

  const mongodbClient = new MongoClient(url);

  const tx = apm.startTransaction('manual');
  useMongodb(mongodbClient, { url, db, col }).then(
    function () {
      tx.end();
      mongodbClient.close();
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, 'useMongodb rejected');
      tx.setOutcome('failure');
      tx.end();
      mongodbClient.close();
      process.exitCode = 1;
    },
  );
}

main();
