#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a script using `pg`.
//
// By default this will use a Postgres on localhost with user 'postgres'.
// You can use:
//    npm run docker:start postgres
// to start a Postgres container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-pg',
});

const { Client, Query } = require('pg');

const client = new Client({
  user: process.env.PGUSER || 'postgres',
});
client.connect(function (err) {
  console.warn('Connected (err=%s)', err);
});

// 1. Callback style
// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
apm.startTransaction('t1');
client.query('SELECT $1::text as message', ['hi'], (err, res) => {
  console.log(
    '[t1] err=%s res=%s',
    err && err.message,
    !err && res.rows[0].message,
  );
});
client.query('SELECT $1::text as message', ['bye'], (err, res) => {
  console.log(
    '[t1] err=%s res=%s',
    err && err.message,
    !err && res.rows[0].message,
  );
  apm.endTransaction();
});

// 2. Using streaming style, i.e. using a `Submittable` as node-postgres calls it.
const t2 = apm.startTransaction('t2');
const q = client.query(new Query('select 1 + 1 as solution'));
q.on('error', (err) => {
  console.log('[t2] Failure: err is', err);
  t2.end();
});
q.on('row', (row) => {
  console.log('[t2] solution is %s', row.solution);
});
q.on('end', () => {
  console.log('[t2] Success');
  t2.end();
});

// 3. Promise style
apm.startTransaction('t3');
client
  .query('select 1 + 1 as solution')
  .then(function (result) {
    console.log('[t3] Success: solution is %s', result.rows[0].solution);
  })
  .catch(function (err) {
    console.log('[t3] Failure: err is', err);
  })
  .finally(function () {
    apm.endTransaction();
  });

// TODO: 4. async/await style

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done');
  client.end();
}, 1000);
