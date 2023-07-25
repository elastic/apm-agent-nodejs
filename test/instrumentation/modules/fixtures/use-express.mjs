/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Exercise Express instrumentation when using ESM.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/fixtures/use-express.mjs

import http from 'http';
import bodyParser from 'body-parser';
import express from 'express';

async function mkRequest(opts, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, function (res) {
      console.log('client response:', res.statusCode, res.headers);
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        console.log('body:', body);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

const app = express();
app.use(express.static(new URL('./static', import.meta.url).pathname));
app.use(bodyParser.json());
app.post('/hello/:name', function (request, reply) {
  reply.send({ hello: request.params.name });
});

const server = app.listen({ port: 0 }, async () => {
  const port = server.address().port;

  // Test `express.static()` usage.
  await mkRequest(`http://127.0.0.1:${port}/style.css`);

  // Do a POST to test `captureBody`.
  const data = JSON.stringify({ foo: 'bar' });
  await mkRequest(
    {
      method: 'POST',
      hostname: '127.0.0.1',
      port,
      path: '/hello/bob',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    data,
  );

  server.close();
});
