/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

var agent = require('../../../..').start({
  secretToken: 'test',
  serviceName: 'test-mariadb-integration',
  serverUrl: 'https://apm-server-lo6wr9-pre.mm-red.net',
  environment: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false,
});

const mariadb = require('mariadb/callback');

function asyncFunction() {
  let pool;
  try {
    pool = mariadb.createPool({
      host: 'mariadb.test.orb.local',
      user: 'root',
      connectionLimit: 5,
    });

    pool.getConnection(function (err, conn) {
      if (err) throw err;
      conn.query('SELECT 1  + ? as val', [1], function (err, rows, fields) {
        conn.release();
        if (err) throw err;
        // rows: [ {val: 1}, meta: ... ]
        console.log(rows);
        // const res = await conn.query('INSERT INTO myTable value (?, ?)', [
        //   1,
        //   'mariadb',
        // ]);
        // res: { affectedRows: 1, insertId: 1, warningStatus: 0 }
        agent.endTransaction('foo');
        pool.end();
      });
    });

    // agent.startTransaction('foo');
    // pool.query('SELECT 1  + ? as val', [1], function (err, rows, fields) {
    //   pool.end();
    //   if (err) throw err;
    //   // rows: [ {val: 1}, meta: ... ]
    //   console.log(rows);
    //   // const res = await conn.query('INSERT INTO myTable value (?, ?)', [
    //   //   1,
    //   //   'mariadb',
    //   // ]);
    //   // res: { affectedRows: 1, insertId: 1, warningStatus: 0 }
    //   agent.endTransaction('foo');
    // });
  } finally {
    // if (pool) pool.end(); //release to pool
  }
}

asyncFunction();
