/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test that the various ways of importing Fastify from an ESM script work.
// See https://nodejs.org/api/esm.html#commonjs-namespaces for docs on the
// import syntaxes. See this for Fastify's supported import/require styles:
// https://github.com/fastify/fastify/blob/v4.17.0/fastify.js#L814-L827
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/fixtures/use-fastify.mjs

import http from 'http';
import assert from 'assert';

import fastify from 'fastify';
import * as mod1 from 'fastify';

// This assert ensures that this import-style works as well:
//    import { fastify } from 'fastify'
assert(fastify === fastify.fastify, 'fastify.fastify is correct');

// This assert ensures this import style works:
//    import * as mod from 'fastify'
//    const server = mod.fastify()
assert(mod1.fastify === fastify);
assert(mod1.default === fastify);

// This assert ensures this import style works:
//    import * as mod from 'fastify'
//    const server = mod.fastify()
const mod2 = await import('fastify');
assert(mod2.fastify === fastify);

const server = fastify();
server.post('/hello/:name', function (request, reply) {
  reply.send({ hello: request.params.name });
});

async function main() {
  await server.listen({ port: 0 });

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
