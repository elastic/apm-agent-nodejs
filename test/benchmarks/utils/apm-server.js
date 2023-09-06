/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A mock APM server that just accepts any request.
// Usage: node apm-server.js PORT
'use strict';

process.on('SIGUSR2', function () {
  process.exit();
});

const http = require('http');

const server = http.createServer(function (req, res) {
  req.on('end', function () {
    res.end();
  });
  req.resume();
});

const PORT = Number(process.argv[2]);
if (isNaN(PORT)) {
  throw new Error(`invalid or missing PORT argument: ${process.argv[2]}`);
}
server.listen(PORT);
