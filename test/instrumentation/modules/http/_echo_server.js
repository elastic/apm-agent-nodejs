/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const fs = require('fs');
var http = require('http');
var https = require('https');
const path = require('path');
var zlib = require('zlib');

const tlsOpts = {
  cert: fs.readFileSync(
    path.resolve(__dirname, '../../../fixtures/certs/cert.pem'),
  ),
  key: fs.readFileSync(
    path.resolve(__dirname, '../../../fixtures/certs/key.pem'),
  ),
};

process.title = 'echo-server';

var server =
  process.argv[2] === 'https'
    ? https.createServer(tlsOpts)
    : http.createServer();

server.on('request', function (req, res) {
  var acceptEncoding = req.headers['accept-encoding'] || '';

  if (/\bdeflate\b/.test(acceptEncoding)) {
    res.writeHead(200, { 'Content-Encoding': 'deflate' });
    req.pipe(zlib.createDeflate()).pipe(res);
  } else if (/\bgzip\b/.test(acceptEncoding)) {
    res.writeHead(200, { 'Content-Encoding': 'gzip' });
    req.pipe(zlib.createGzip()).pipe(res);
  } else {
    req.pipe(res);
  }
});

server.listen(function () {
  console.log(server.address().port);
});

// auto-shutdown after 1 minute (tests that last longer are probably broken)
setTimeout(function () {
  server.close();
}, 60 * 1000);
