/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../../../../..').start({
  serviceName: 'use-mongodb-async-context',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
  spanCompressionEnabled: false,
});
const http = require('http');
const MongoClient = require('mongodb').MongoClient;

// ---- support functions
async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.request(url).on('response', resolve).on('error', reject).end();
  });
}

/**
 *
 * @param {import('mongodb').MongoClient} mongodbClient
 * @param {{ port: number }} options
 */
async function useMongodbAsyncContext(options) {
  const { port } = options;
  const serverUrl = `http://localhost:${port}`;

  // 1st fill with some data
  await makeRequest(`${serverUrl}/insert`);

  const reqs = new Array(50).fill(`${serverUrl}/find`).map(makeRequest);

  // Wait for all request to finish
  await Promise.all(reqs);

  // Clear the data
  await makeRequest(`${serverUrl}/delete`);

  // Make sure APM Server receives all spans
  await apm.flush();
}

// ---- mainline

async function main() {
  const host = process.env.TEST_HOST || '127.0.0.1';
  const port = process.env.TEST_PORT || '27017';
  const db = process.env.TEST_DB || 'elasticapm';
  const col = process.env.TEST_COLLECTION || 'test';
  const url = `mongodb://${host}:${port}`;

  const mongodbClient = await MongoClient.connect(url);
  const server = http.createServer(function (req, res) {
    req.resume();
    req.on('end', function () {
      const successBody = JSON.stringify({ success: true });
      const failureBody = JSON.stringify({ success: true });
      if (req.url === '/insert') {
        const items = new Array(500).fill({}).map((_, num) => ({ num }));
        mongodbClient
          .db(db)
          .collection(col)
          .insertMany(items)
          .then(function () {
            res.writeHead(200, {
              server: 'trace-mongodb-cats-server',
              'content-type': 'text/plain',
              'content-length': Buffer.byteLength(successBody),
            });
            res.end(successBody);
          });
      } else if (req.url === '/find') {
        mongodbClient
          .db(db)
          .collection(col)
          .find()
          .toArray()
          .then(JSON.stringify)
          .then(function (body) {
            res.writeHead(200, {
              server: 'trace-mongodb-cats-server',
              'content-type': 'text/plain',
              'content-length': Buffer.byteLength(body),
            });
            res.end(body);
          });
      } else if (req.url === '/delete') {
        mongodbClient
          .db(db)
          .collection(col)
          .deleteMany({})
          .then(function (body) {
            res.writeHead(200, {
              server: 'trace-mongodb-cats-server',
              'content-type': 'text/plain',
              'content-length': Buffer.byteLength(successBody),
            });
            res.end(successBody);
          });
      } else {
        res.writeHead(200, {
          server: 'trace-mongodb-cats-server',
          'content-type': 'text/plain',
          'content-length': Buffer.byteLength(failureBody),
        });
        res.end(failureBody);
      }
    });
  });
  server.listen();

  useMongodbAsyncContext(server.address()).then(
    function () {
      server.close();
      mongodbClient.close();
    },
    function (err) {
      apm.logger.error(err, 'useMongodbAsyncContext rejected');
      server.close();
      mongodbClient.close();
      process.exitCode = 1;
    },
  );
}

main();
