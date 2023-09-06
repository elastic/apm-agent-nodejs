/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --require=./start.js test/instrumentation/modules/fixtures/use-fastify.js

const http = require('http');

const fastify = require('fastify');

const server = fastify();
server.post('/hello/:name', function (request, reply) {
  reply.send({ hello: request.params.name });
});

async function main() {
  await server.listen({ port: 3000 });

  // Do a POST to test `captureBody`, wait for response, then exit.
  const port = server.server.address().port;
  const data = JSON.stringify({ foo: 'bar' });
  const req = http.request(
    {
      method: 'POST',
      hostname: '127.0.0.1',
      port,
      path: '/hello/bob',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    },
    function (res) {
      console.log('client response:', res.statusCode, res.headers);
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        console.log('body:', body);
        server.close();
      });
    },
  );
  req.write(data);
  req.end();
}

main();
