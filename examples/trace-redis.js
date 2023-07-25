#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'redis' package.
//
// This assumes a Redis server running on localhost. You can use:
//    npm run docker:start redis
// to start an Redis docker container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-redis4',
  spanCompressionEnabled: false,
});

const redis = require('redis');

async function useRedis() {
  let res;

  const client = redis.createClient({
    name: 'example-trace-redis4', // This results in early `CLIENT SETNAME` sent in RedisClient.#initiateSocket()
    database: 1, // This results in early `SELECT` sent in RedisClient.#initiateSocket()
  });

  await client.connect();

  try {
    res = await client.ping();
    console.log('PING res: ', res);
  } catch (err) {
    console.log('PING err: ', err);
  }

  try {
    res = await client.set('foo', 'bar');
    console.log('SET res: ', res);
  } catch (err) {
    console.log('SET err: ', err);
  }

  try {
    res = await client.get('foo');
    console.log('GET res: ', res);
  } catch (err) {
    console.log('GET err: ', err);
  }

  try {
    res = await client.multi().set('spam', 'eggs').get('spam').exec();
    console.log('MULTI res: ', res);
  } catch (err) {
    console.log('MULTI err: ', err);
  }

  await client.quit();
}

async function main() {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because this script is not running
  // an HTTP server, we manually start a transaction. More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const trans = apm.startTransaction('trans');

  Promise.all([useRedis()]).then(() => {
    trans.end();
  });
}

main();
