#!/usr/bin/env node --no-warnings

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// This example shows use of Node v18's core `fetch()`. The Node.js APM agent
// will automatically instrument it.

const apm = require('../').start({
  serviceName: 'example-trace-fetch',
});

const url = process.argv[2] || 'https://httpstat.us/200';

async function main() {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because this script is not running
  // an HTTP server, we manually start a transaction. More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const trans = apm.startTransaction('trans');
  try {
    const res = await fetch(url);
    for (const [k, v] of res.headers) {
      console.log(`${k}: ${v}`);
    }
    const body = await res.text();
    console.log('\n' + body);
  } catch (err) {
    console.error('fetch error:', err);
  } finally {
    if (trans) trans.end();
  }
}

main();
