#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of the core 'http' module.
//
// 1. This creates an HTTP server listening at http://localhost:3000
// 2. For any incoming request it makes an outgoing HTTPS request to
//    'https://google.com/'.
// 3. Calls the created HTTP server to trigger the above request handling.
//
// We expect the APM agent to automatically generate tracing data for (1) and (2).

require('../').start({
  serviceName: 'example-trace-http',
  useElasticTraceparentHeader: false,
  // 'usePathAsTransactionName' can be useful when not using a web framework
  // with a router. See the following for details:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-stack.html#custom-stack-route-naming
  usePathAsTransactionName: true,
});

const http = require('http');
const https = require('https');

const server = http.createServer(function onRequest(req, res) {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);

  req.resume();

  req.on('end', function () {
    // Make a client request.
    https.get('https://google.com/', function (cRes) {
      console.log('google.com response: %s %s', cRes.statusCode, cRes.headers);
      cRes.resume();
      cRes.on('end', function () {
        // Then reply to the incoming request.
        const resBody = 'pong';
        res.writeHead(200, {
          server: 'example-trace-http',
          'content-type': 'text/plain',
          'content-length': Buffer.byteLength(resBody),
        });
        res.end(resBody);
      });
    });
  });
});

server.listen(3000, function () {
  // Make a request to our HTTP server listening at http://localhost:3000.
  //
  // Note that this there is no current "transaction" here, so this HTTP
  // request is not captured by APM. See "trace-http-request.js" for more.
  const clientReq = http.request(
    'http://localhost:3000/',
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
        server.close();
      });
    },
  );
  clientReq.end();
});
