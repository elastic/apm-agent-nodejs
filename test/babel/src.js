/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Note that we cannot use `import apm from 'elastic-apm-node'; apm.start()`
// with Babel's translation from ESM to CommonJS, otherwise the `apm.start()`
// will come *after* the imports we need to instrument (e.g. `import http ...`).
//
// APM agent config is coming from "./elastic-apm-node.js".
import apm from '../../start';

// Start and HTTP server and make a request to it. If APM is working we'd
// expect a captured transaction for the server request.
import assert from 'assert';
import http from 'http';
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.end('pong');
  });
});
server.listen(4321, () => {
  http.get('http://localhost:4321', (res) => {
    console.log('CLIENT: res.headers:', res.headers);
    res.on('data', (chunk) => {
      console.log('CLIENT: res data: %j', chunk.toString());
    });
    res.on('end', () => {
      assert(
        apm._apmClient.transactions && apm._apmClient.transactions.length === 1,
        'got the expected APM transaction',
      );
      server.close();
    });
  });
});
