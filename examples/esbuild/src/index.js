/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

require('elastic-apm-node').start();

const http = require('http');
const { handleRequest } = require('./handler');

// Start a simple HTTP server.
const server = http.createServer(handleRequest);
server.listen(3000, () => {
  // Make a single request and then stop.
  http.get('http://localhost:3000', (res) => {
    console.log('CLIENT: res.headers:', res.headers);
    res.on('data', (chunk) => {
      console.log('CLIENT: res "data": %s', chunk);
    });
    res.on('end', () => {
      console.log('CLIENT: res "end"');
      server.close();
    });
  });
});
