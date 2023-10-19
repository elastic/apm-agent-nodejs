/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../../../../..').start({
  serviceName: 'use-mongodb-connect',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
  spanCompressionEnabled: false,
});

const MongoClient = require('mongodb').MongoClient;

// ---- support functions
/**
 *
 * @param {import('mongodb').MongoClient} mongodbClient
 * @param {Record<string, string>} options
 */
async function useMongodbConnect(options) {
  const { url, db, col, useCallbacks } = options;
  const log = apm.logger.child({
    'event.module': 'app',
    url,
    database: db,
    collection: col,
    useCallbacks,
  });

  /** @type {import('mongodb').MongoClient} */
  let client;

  // Test connections using callbacks
  if (useCallbacks) {
    // 'new MongoClient(url); client.connect(callback)',
    client = new MongoClient(url);
    await new Promise((resolve, reject) => {
      client.connect(function (err) {
        log.info({ err }, 'new MongoClient(url); client.connect(callback)');
        if (err) {
          reject(err);
        } else {
          client
            .db(db)
            .collection(col)
            .findOne({ a: 1 }, function (err) {
              log.info({ err }, 'findOne');
              err ? reject(err) : resolve();
            });
        }
      });
    });
    await client.close();
    log.info({}, 'closed');

    // 'new MongoClient(url, {...}); client.connect(callback)',
    client = new MongoClient(url, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
    });
    await new Promise((resolve, reject) => {
      client.connect(function (err) {
        log.info(
          { err },
          'new MongoClient(url, {...}); client.connect(callback)',
        );
        if (err) {
          reject(err);
        } else {
          client
            .db(db)
            .collection(col)
            .findOne({ a: 1 }, function (err) {
              log.info({ err }, 'findOne');
              err ? reject(err) : resolve();
            });
        }
      });
    });
    await client.close();
    log.info({}, 'closed');

    // 'MongoClient.connect(url, callback)',
    await new Promise((resolve, reject) => {
      MongoClient.connect(url, function (err, res) {
        client = res;
        log.info({ err }, 'MongoClient.connect(url, callback)');
        if (err) {
          reject(err);
        } else {
          client
            .db(db)
            .collection(col)
            .findOne({ a: 1 }, function (err) {
              log.info({ err }, 'findOne');
              err ? reject(err) : resolve();
            });
        }
      });
    });
    await client.close();
    log.info({}, 'closed');
  }

  // 'await MongoClient.connect(url)'
  client = await MongoClient.connect(url);
  await client.db(db).collection(col).findOne({ a: 1 });
  await client.close();
}

// ---- mainline

async function main() {
  const host = process.env.TEST_HOST || '127.0.0.1';
  const port = process.env.TEST_PORT || '27017';
  const db = process.env.TEST_DB || 'elasticapm';
  const col = process.env.TEST_COLLECTION || 'test';
  const url = `mongodb://${host}:${port}`;
  const useCallbacks = process.env.TEST_USE_CALLBACKS === 'true';

  const tx = apm.startTransaction('manual');
  useMongodbConnect({ url, db, col, useCallbacks }).then(
    function () {
      tx.end();
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, 'useMongodbConnect rejected');
      tx.setOutcome('failure');
      tx.end();
      process.exitCode = 1;
    },
  );
}

main();
