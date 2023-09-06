/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/http/fixtures/use-https-get.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'
import assert from 'assert';

import https, { get } from 'https';
import * as mod from 'https';
import * as prefixedMod from 'node:https';

// Assert that other import styles would get the same wrapped handler.
assert(https.get === get);
assert(mod.get === get);
assert(mod.default.get === get);
assert(prefixedMod.get === get);
assert(prefixedMod.default.get === get);

apm.startTransaction('manual');
get('https://www.google.com/', (res) => {
  console.log('client response: %s %s', res.statusCode, res.headers);
  res.resume();
  res.on('end', () => {
    console.log('client response: end');
    apm.endTransaction();
  });
});
