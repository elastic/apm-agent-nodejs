/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../../../../..').start({
  serviceName: 'use-mongodb',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
  spanCompressionEnabled: false,
});
const assert = require('assert');

const MongoClient = require('mongodb').MongoClient;

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

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#insertMany
  data = await collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], {
    w: 1,
  });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'insertMany with promise');

  if (useCallbacks) {
    data = await new Promise((resolve, reject) => {
      collection.insertMany(
        [{ a: 4 }, { a: 5 }, { a: 6 }],
        { w: 1 },
        function (err, res) {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
      );
    });
    assert(
      apm.currentSpan === null,
      'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
    );
    log.info({ data }, 'insertMany with callback');
  }

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#findOne
  data = await collection.findOne({ a: 1 });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'findOne with promises');

  // There was a time when the spans created for Mongo client commands, while
  // one command was already inflight, would be a child of the inflight span.
  // That would be wrong. They should all be a direct child of the transaction.
  const queries = [{ a: 1 }, { b: 2 }, { c: 3 }];
  await Promise.all(queries.map((q) => collection.findOne(q)));

  if (useCallbacks) {
    data = await new Promise((resolve, reject) => {
      collection.findOne({ a: 4 }, function (err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
    assert(
      apm.currentSpan === null,
      'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
    );
    log.info({ data }, 'findOne with callback');
  }

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#update
  data = await collection.updateOne({ a: 1 }, { $set: { b: 1 } }, { w: 1 });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'updateOne with promises');

  if (useCallbacks) {
    data = await new Promise((resolve, reject) => {
      collection.updateOne(
        { a: 4 },
        { $set: { b: 4 } },
        { w: 1 },
        function (err, res) {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
      );
    });
    assert(
      apm.currentSpan === null,
      'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
    );
    log.info({ data }, 'updateOne with callback');
  }

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#deleteOne
  data = await collection.deleteOne({ a: 1 }, { w: 1 });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'deleteOne with promises');

  if (useCallbacks) {
    data = await new Promise((resolve, reject) => {
      collection.deleteOne({ a: 4 }, { w: 1 }, function (err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
    assert(
      apm.currentSpan === null,
      'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
    );
    log.info({ data }, 'deleteOne with callback');
  }

  const cursor = collection.find({});
  data = await cursor.next();
  assert(data.a === 2, 'found record #2');
  log.info({ data }, 'cursor.next()');

  data = await cursor.next();
  assert(data.a === 3, 'found record #3');
  log.info({ data }, 'cursor.next()');

  if (useCallbacks) {
    data = await cursor.next();
    assert(data.a === 5, 'found record #5');
    log.info({ data }, 'cursor.next()');

    data = await cursor.next();
    assert(data.a === 6, 'found record #6');
    log.info({ data }, 'cursor.next()');
  }

  // https://mongodb.github.io/node-mongodb-native/4.7/classes/Collection.html#deleteMany
  data = await collection.deleteMany({ a: { $lte: 3 } }, { w: 1 });
  assert(
    apm.currentSpan === null,
    'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'deleteMany with promises');

  if (useCallbacks) {
    data = await new Promise((resolve, reject) => {
      collection.deleteMany({ a: { $gte: 4 } }, { w: 1 }, function (err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
    assert(
      apm.currentSpan === null,
      'Mongodb span (or its HTTP span) should not be currentSpan after awaiting the task',
    );
    log.info({ data }, 'deleteMany with callback');
  }
}

// ---- mainline

async function main() {
  const host = process.env.TEST_HOST || '127.0.0.1';
  const port = process.env.TEST_PORT || '27017';
  const db = process.env.TEST_DB || 'elasticapm';
  const col = process.env.TEST_COLLECTION || 'test';
  const url = `mongodb://${host}:${port}`;
  const useCallbacks = process.env.TEST_USE_CALLBACKS === 'true';

  const mongodbClient = new MongoClient(url);

  const tx = apm.startTransaction('manual');
  useMongodb(mongodbClient, { url, db, col, useCallbacks }).then(
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
