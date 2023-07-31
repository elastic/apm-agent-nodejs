#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'memcached' package.
//
// This assumes a Memcached server running on localhost. You can use:
//    npm run docker:start memcached
// to start a Memcached container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-memcached',
});

const Memcached = require('memcached');
const memcached = new Memcached('localhost:11211', { timeout: 500 });

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1');

memcached.touch('foo', 10, function (err, res) {
  console.log('touch foo: err=%s res=%j', err && err.message, res);
});
memcached.set('foo', 'bar', 10, function (err, res) {
  console.log('set foo: err=%s res=%j', err && err.message, res);

  memcached.get('foo', function (err, res) {
    console.log('get foo: err=%s res=%j', err && err.message, res);
  });

  memcached.gets('foo', function (err, res) {
    console.log('gets foo: err=%s res=%j', err && err.message, res);

    memcached.cas('foo', 'baz', res.cas, 10, function (casErr, casRes) {
      console.log('cas foo: err=%s res=%j', casErr && casErr.message, casRes);

      memcached.get('foo', function (err, res) {
        console.log('get foo: err=%s res=%j', err && err.message, res);

        t1.end();
        memcached.end();
      });
    });
  });
});
