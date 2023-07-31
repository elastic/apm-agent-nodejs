#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a script the `mysql2` package.
//
// By default this will use a MySQL on localhost with user 'root'. You can use:
//    npm run docker:start mysql
// to start a MySQL container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-mysql2',
});

const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');

const conn = mysql.createConnection({ user: 'root' });

// 1. Simple queries, callback-style.
// Note: For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start transactions. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1-callback-style');
conn.query('SELECT 1 + 1 AS solution', (err, results, _fields) => {
  console.log('SELECT 1+1: err=%s results=%o', err, results);
});
conn.query('SELECT ? + ? AS solution', [2, 2], (err, results, _fields) => {
  console.log('SELECT 2+2: err=%s results=%o', err, results);
  t1.end();
});

// 2. Tracing of prepared statements can show that subsequent executions of the
// same query can be much faster. This example is derived from:
// https://github.com/sidorares/node-mysql2/blob/master/examples/execute.js
const t2 = apm.startTransaction('t2-prepared-statements');
conn.execute(
  'select ?+1 as qqq, ? as rrr, ? as yyy',
  [1, null, 3],
  (err, rows, fields) => {
    console.log('execute 1: err=%s results=%o', err, rows);
    conn.execute(
      'select ?+1 as qqq, ? as rrr, ? as yyy',
      [3, null, 3],
      (err, rows, fields) => {
        console.log('execute 2: err=%s results=%o', err, rows);
        conn.unprepare('select ?+1 as qqq, ? as rrr, ? as yyy');
        conn.execute(
          'select ?+1 as qqq, ? as rrr, ? as yyy',
          [3, null, 3],
          (err, rows, fields) => {
            console.log('execute 3: err=%s results=%o', err, rows);
            t2.end();
          },
        );
      },
    );
  },
);

// 3. Promise style
async function promiseStyle() {
  const conn2 = await mysqlPromise.createConnection({ user: 'root' });
  const t3 = apm.startTransaction('t3-promise-style');

  const [rows] = await conn2.query('select 3 + 3 as solution');
  console.log('select 3+3: rows=%o', rows);

  // "upgrade" from non-promise connection
  conn
    .promise()
    .query('select 4 + 4 as solution')
    .then(([rows, _fields]) => {
      console.log('select 4+4: rows=%o', rows);
    })
    .catch((err) => {
      console.log('select 4+4: err=%s', err);
    });

  t3.end();
  conn2.close();
}
promiseStyle();

// Lazily shutdown client after everything above is finished.
setTimeout(() => {
  console.log('Done');
  conn.end();
}, 1000);
