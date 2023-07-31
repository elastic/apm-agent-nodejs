/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A duplicate of "use-http-server.mjs" that uses dynamic `import()`.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/http/fixtures/use-dynamic-import.mjs

const http = await import('http');

const server = http.createServer((req, res) => {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);
  req.resume();
  req.on('end', function () {
    console.log('incoming request: end');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('pong');
  });
});

server.listen(0, () => {
  http.get(`http://127.0.0.1:${server.address().port}/`, (res) => {
    console.log('client response: %s %s', res.statusCode, res.headers);
    res.resume();
    res.on('end', () => {
      console.log('client response: end');
      server.close();
    });
  });
});
