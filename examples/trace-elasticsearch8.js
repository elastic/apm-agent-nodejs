#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing @elastic/elasticsearch version 8.
//
// This assumes an Elasticsearch running on localhost. You can use:
//    npm run docker:start elasticsearch
// to start an Elasticsearch docker container. Then the following to stop:
//    npm run docker:stop

const apm = require('../').start({
  serviceName: 'example-trace-elasticsearch8',
  logUncaughtExceptions: true,
});

// eslint-disable-next-line no-unused-vars
const { Client, HttpConnection } = require('@elastic/elasticsearch');

const client = new Client({
  // By default version 8 uses the new undici HTTP client lib. You can specify
  // `HttpConnection` to use the older HTTP client.
  // Connection: HttpConnection,

  node: process.env.ES_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ES_USERNAME || undefined,
    password: process.env.ES_PASSWORD || undefined,
  },
  maxRetries: 1,
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
    console.log('[example 1] search succeeded: hits:', res.hits);
  } catch (err) {
    console.log('[example 1] search error:', err.message);
  } finally {
    t1.end();
  }

  // Using Promises directly.
  const t2 = apm.startTransaction('t2');
  client
    .ping()
    .then((_res) => {
      console.log('[example 2] ping succeeded');
    })
    .catch((err) => {
      console.log('[example 2] ping error:', err);
    });
  // Another request to have two concurrent requests. Also use a bogus index
  // to trigger an error and see APM error capture.
  client
    .search({ index: 'no-such-index', q: 'pants' })
    .then((_res) => {
      console.log('[example 2] search succeeded');
    })
    .catch((err) => {
      console.log('[example 2] search error:', err.message);
    })
    .finally(() => {
      t2.end();
    });

  // Example aborting requests using AbortController (node v15 and above).
  if (global.AbortController) {
    const t3 = apm.startTransaction('t3');
    const ac = new AbortController(); // eslint-disable-line no-undef
    setImmediate(() => {
      ac.abort();
    });
    try {
      const res = await client.search(
        { query: { match_all: {} } },
        { signal: ac.signal },
      );
      console.log('[example 3] search response:', res);
    } catch (err) {
      console.log('[example 3] search error:', err);
    } finally {
      t3.end();
    }
  }
}

run();
