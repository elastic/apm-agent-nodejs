#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of the core 'http' module,
// using IPv6.

const apm = require('../').start({
  serviceName: 'example-trace-http-ipv6',
  // 'usePathAsTransactionName' can be useful when not using a web framework
  // with a router. See the following for details:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-stack.html#custom-stack-route-naming
  usePathAsTransactionName: true,
});

const http = require('http');

const server = http.createServer(function onRequest(req, res) {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);

  req.resume();

  req.on('end', function () {
    const resBody = 'pong';
    res.writeHead(200, {
      server: 'example-trace-http-ipv6',
      'content-type': 'text/plain',
      'content-length': Buffer.byteLength(resBody),
    });
    res.end(resBody);
  });
});

server.listen(3000, '::1', function () {
  const trans = apm.startTransaction('manual');
  const clientReq = http.request(
    'http://user:pass@[::1]:3000/',
    function (clientRes) {
      console.log(
        'client response: %s %s',
        clientRes.statusCode,
        clientRes.headers,
      );
      const chunks = [];
      clientRes.on('data', function (chunk) {
        chunks.push(chunk);
      });
      clientRes.on('end', function () {
        const body = chunks.join('');
        console.log('client response body: %j', body);
        trans.end();
        server.close();
      });
    },
  );
  clientReq.end();
});
