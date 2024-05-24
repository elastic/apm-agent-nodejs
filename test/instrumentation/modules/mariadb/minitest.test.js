/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

(async function () {
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

  const mariadb = require('mariadb');

  const pool = mariadb.createPool({
    host: 'mariadb.test.orb.local',
    user: 'root',
    connectionLimit: 5,
  });

  async function asyncFunction() {
    let conn;
    try {
      agent.startTransaction('foo');
      conn = await mariadb.createConnection({
        host: 'mariadb.test.orb.local',
        user: 'root',
        connectionLimit: 5,
      });

      const rows = await conn.queryStream('SELECT 1  + ? as val', [1]);

      for await (const row of rows) {
        console.log(row);
      }
      // rows: [ {val: 1}, meta: ... ]
      // console.log(rows);
      // const res = await conn.query('INSERT INTO myTable value (?, ?)', [
      //   1,
      //   'mariadb',
      // ]);
      // res: { affectedRows: 1, insertId: 1, warningStatus: 0 }
      agent.endTransaction('foo');
    } finally {
      if (conn) conn.end(); //release to pool
    }
  }

  await asyncFunction();
  await pool.end();
})();
