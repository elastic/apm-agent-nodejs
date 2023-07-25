/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION=0 \
//      NODE_OPTIONS='--experimental-loader=./loader.mjs --require=./start.js' \
//      node test/instrumentation/modules/fixtures/use-knex-pg.mjs

import apm from '../../../../index.js'; // 'elastic-apm-node'
import Knex from 'knex';

const DBNAME = 'test_use_knex_pg';

function createKnex(dbName = undefined) {
  return Knex({
    client: 'pg',
    connection: {
      user: process.env.PGUSER || 'postgres',
      database: dbName,
    },
  });
}

async function setupDb() {
  const knex = createKnex();
  const res = await knex.from('pg_database').where('datname', DBNAME);
  if (res.length < 1) {
    await knex.raw('CREATE DATABASE ??;', [DBNAME]);
  }
  await knex.destroy();
}

async function teardownDb() {
  const knex = createKnex();
  await knex.raw('DROP DATABASE IF EXISTS ??', [DBNAME]);
  await knex.destroy();
}

async function useTheDb(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id');
    table.string('user_name');
  });
  await knex('users').insert({ user_name: 'Tim' });
  const hits = await knex('users').where('user_name', 'Tim');
  console.log('Hits for user_name=Tim:', hits);
}

async function main() {
  await setupDb();
  const knex = createKnex(DBNAME);

  const trans = apm.startTransaction('trans');
  try {
    await useTheDb(knex);
  } finally {
    trans.end();

    await knex.destroy();
    await teardownDb();
  }
}

main();
