#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'redis' package.
//
// This assumes a Redis server running on localhost. You can use:
//    npm run docker:start
// to start an Redis docker container (and other containers used for
// testing of this project). Then `npm run docker:stop` to stop them.

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-redis4'
})

const redis = require('redis')

async function useRedis () {
  let res

  const client = redis.createClient({
    name: 'example-trace-redis4', // This results in early `CLIENT SETNAME` sent in RedisClient.#initiateSocket()
    database: 1 // This results in early `SELECT` sent in RedisClient.#initiateSocket()
  })

  // XXX how to capture these without impacting. Wrap .emit() on the RedisClient?
  // client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect()

  try {
    res = await client.ping()
    console.log('XXX ping res: ', res)
  } catch (err) {
    console.log('XXX ping err: ', err)
  }

  try {
    res = await client.set('foo', 'bar')
    console.log('XXX set res: ', res)
  } catch (err) {
    console.log('XXX set err: ', err)
  }

  try {
    res = await client.get('foo')
    console.log('XXX get res: ', res)
  } catch (err) {
    console.log('XXX get err: ', err)
  }

  try {
    res = await client.multi()
      .set('spam', 'eggs')
      .get('spam')
      .exec()
    console.log('XXX multi res: ', res)
  } catch (err) {
    console.log('XXX multi err: ', err)
  }

  // XXX example error capture?
  // XXX example AbortSignal usage?
  // XXX example using legacy mode? https://github.com/redis/node-redis/blob/master/docs/v3-to-v4.md#legacy-mode
  // XXX example using isolated execution? https://github.com/redis/node-redis/blob/master/docs/isolated-execution.md

  await client.quit()
}

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const trans = apm.startTransaction('trans')

useRedis()
  .then(() => {
    trans.end()
  })
