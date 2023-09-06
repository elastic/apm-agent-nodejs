#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a script using `tedious`,
// a package for interacting with SQL Server (mssql).
//
// By default this will use a mssql on localhost as the "SA" user. You can use:
//    npm run docker:start mssql
// to start a mssql container. Then `npm run docker:stop` to stop it.

const apm = require('../').start({
  serviceName: 'example-trace-tedious',
});

const tedious = require('tedious');

const host = process.env.MSSQL_HOST || 'localhost';
const passwd = process.env.SA_PASSWORD || 'Very(!)Secure';
const connOpts = {
  server: host,
  authentication: {
    type: 'default',
    options: {
      userName: 'SA',
      password: passwd,
    },
  },
  options: {
    // Tedious@9 changed to `trustServerCertificate: false` by default.
    trustServerCertificate: true,
    // Silence deprecation warning in tedious@8.
    validateBulkLoadParameters: true,
  },
};

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t0 = apm.startTransaction('t0');

// A simple SELECT.
const conn = new tedious.Connection(connOpts);
conn.on('connect', onConnect);
conn.connect();
function onConnect() {
  const req = new tedious.Request(
    'select 1 + 1 as solution',
    (err, rowCount) => {
      console.log(
        'select 1+1: err=%s rowCount=%s',
        err && err.message,
        rowCount,
      );
      conn.close();
    },
  );
  req.on('row', (row) => {
    console.log('select 1+1: row[0].value=%j', row[0].value);
  });
  conn.execSql(req);
}

// Using parameters.
const conn2 = new tedious.Connection(connOpts);
conn2.on('connect', onConnect2);
conn2.connect();
function onConnect2() {
  const req = new tedious.Request("select @mynum=42, @mystr='qaz'", function (
    err,
    rowCount,
  ) {
    console.log(
      'select @mynum ...: err=%s rowCount=%s',
      err && err.message,
      rowCount,
    );
    conn2.close();
  });
  req.addOutputParameter('mynum', tedious.TYPES.Int);
  req.addOutputParameter('mystr', tedious.TYPES.VarChar);
  req.on('returnValue', function (parameterName, value, _metadata) {
    console.log('select @mynum ...: returnValue: %s=%s', parameterName, value);
  });
  conn2.execSql(req);
}

setTimeout(function () {
  console.log('Done');
  t0.end();
}, 500);
