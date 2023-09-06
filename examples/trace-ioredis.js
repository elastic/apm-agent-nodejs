#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'ioredis' package.
//
// This assumes a Redis server running on localhost. You can use:
//    npm run docker:start
// to start an Redis docker container (and other containers used for
// testing of this project). Then `npm run docker:stop` to stop them.

const apm = require('../').start({
  serviceName: 'example-trace-ioredis',
});

const Redis = require('ioredis');
const redis = new Redis();

// Convenience printer for redis client callbacks.
function printerCb(name) {
  return function (err, results) {
    console.log('%s: %o', name, err ? `${err.name}: ${err.message}` : results);
  };
}

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1');

redis.set('foo', 'bar');
redis.get('foo', printerCb('GET foo'));
redis.get('foo').then(function (result) {
  console.log('GET foo (with promise):', result);
});

// Transactions.
redis
  .multi()
  .set('foo', 'bar', printerCb('SET in MULTI'))
  .get('foo')
  .exec(printerCb('EXEC'));

// Error capture.
redis.hset('a', 'b', 'c');
redis.get('a', printerCb('GET a (wrong type)'));

t1.end();
redis.quit();
