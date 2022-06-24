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
  serviceName: 'example-trace-redis'
})

const redis = require('redis')

const client = redis.createClient()

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1')

client.set('key1', 'val1')
client.get('key1', function (err, reply) {
  console.log('GET key1: %s', err ? `${err.name}: ${err.message}` : reply)
  t1.end()
  client.quit()
})

// Simulate a redis client error with `enable_offline_queue: false` and a
// quick `.set()` before the client connection ready.
const clientSimErr = redis.createClient({ enable_offline_queue: false })
const t2 = apm.startTransaction('t2')
clientSimErr.set('key2', 'val2', function (err, reply) {
  console.log('SET key2: %s', err ? `${err.name}: ${err.message}` : reply)
  t2.end()
  clientSimErr.quit()
})
