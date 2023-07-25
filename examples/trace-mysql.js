#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a script using `mysql`.
//
// By default this will use a MySQL on localhost with user 'root'. You can use:
//    npm run docker:start
// to start a MySQL container (and other containers used for testing of
// this project).

const apm = require('../').start({
  serviceName: 'example-trace-mysql',
});

const mysql = require('mysql');

const client = mysql.createConnection({
  user: process.env.MYSQL_USER || 'root',
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
const t1 = apm.startTransaction('t1');
client.query('SELECT 1 + 1 AS solution', (err, res) => {
  if (err) {
    console.log('[t1] Failure: err is', err);
  } else {
    console.log('[t1] Success: solution is %s', res[0].solution);
  }
  t1.end();
});

// 2. Event emitter style
const t2 = apm.startTransaction('t2');
const q = client.query('SELECT 1 + 1 AS solution');
q.on('error', function (err) {
  console.log('[t2] Failure: err is', err);
});
q.on('result', function (row) {
  console.log('[t2] solution is', row.solution);
});
q.on('end', function () {
  console.log('[t2] End');
  t2.end();
});

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done');
  client.end();
}, 1000);
