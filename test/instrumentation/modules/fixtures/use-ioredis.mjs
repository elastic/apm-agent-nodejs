/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/fixtures/use-ioredis.mjs

import apm from '../../../../index.js'; // 'elastic-apm-node'
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_HOST);

async function main() {
  const trans = apm.startTransaction('trans');
  let val;

  redis.set('foo', 'bar');
  val = await redis.get('foo');
  console.log('foo:', val);

  redis.hset('myhash', 'field1', 'val1');
  try {
    val = await redis.get('myhash'); // Wrong command for type, should reject.
  } catch (e) {
    console.log('able to catch a throw');
  }

  trans.end();
  await redis.quit();
}

main();
