/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/fixtures/use-pg.mjs

import apm from '../../../../index.js'; // 'elastic-apm-node'

import pg from 'pg';

async function main() {
  const client = new pg.Client({
    user: process.env.PGUSER || 'postgres',
  });
  await client.connect();

  const trans = apm.startTransaction('trans');

  const res = await client.query('SELECT $1::text as message', ['hi']);
  console.log('using await:', res.rows[0].message);

  await new Promise((resolve) => {
    client.query('SELECT $1::text as message', ['bye'], (err, res) => {
      console.log('using callback:', err ? err.stack : res.rows[0].message);
      resolve();
    });
  });

  trans.end();
  await client.end();
}

main();
