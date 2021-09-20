#!/usr/bin/env node

// A small example showing Elastic APM tracing of a script using `memcached`.
//
// By default this will use a Memcached on localhost. You can use:
//    npm run docker:start
// to start a Memcached container (and other containers used for testing of
// this project).

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-memcached'
})

const Memcached = require('memcached')

const HOST = process.env.MEMCACHED_HOST || '127.0.0.1'
const PORT = 11211
const client = new Memcached(`${HOST}:${PORT}`, { timeout: 500 })

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
apm.startTransaction('t0')

client.version(function (err, data) {
  console.log('Version: data=%j (err=%s)', data, err)

  client.set('foo', 'bar', 10, function (err) {
    console.log('Set: foo (err=%s)', err)

    client.get('foo', function (err, data) {
      console.log('Get foo: %s (err=%s)', data, err)

      client.get('foo', function (err, data) {
        console.log('Get foo (again): %s (err=%s)', data, err)

        apm.endTransaction()
        client.end()
      })
    })
  })
})
