#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing @elastic/elasticsearch version 7.
//
// This assumes an Elasticsearch running on localhost. You can use:
//    npm run docker:start elasticsearch
// to start an Elasticsearch docker container. Then the following to stop:
//    npm run docker:stop

const apm = require('../').start({
  serviceName: 'example-trace-elasticsearch7',
  logUncaughtExceptions: true,
});

// Note that version 7 is *not* installed by default. To use v7 you'll need to:
//    npm install @elastic/elasticsearch@7
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: process.env.ES_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ES_USERNAME || undefined,
    password: process.env.ES_PASSWORD || undefined,
  },
});

async function run() {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because this script is not running
  // an HTTP server, we manually start a transaction. More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const t1 = apm.startTransaction('t1');

  // Using await.
  try {
    const res = await client.search({ q: 'pants' });
    console.log('search succeeded: hits:', res.body.hits);
  } catch (err) {
    console.log('search error:', err.message);
  } finally {
    t1.end();
  }

  // Using Promises directly.
  const t2 = apm.startTransaction('t2');
  client
    .ping()
    .then((_res) => {
      console.log('ping succeeded');
    })
    .catch((err) => {
      console.log('ping error:', err);
    });
  // Another request to have two concurrent requests. Also use a bogus index
  // to trigger an error and see APM error capture.
  client
    .search({ index: 'no-such-index', q: 'pants' })
    .then((_res) => {
      console.log('search succeeded');
    })
    .catch((err) => {
      console.log('search error:', err.message);
    })
    .finally(() => {
      t2.end();
    });

  // Callback style.
  const t3 = apm.startTransaction('t3');
  client.ping(function (err, _res) {
    console.log(
      'ping',
      err ? `error ${err.name}: ${err.message}` : 'succeeded',
    );
    t3.end();
  });
}

run();
