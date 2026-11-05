/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --require=./start.js test/instrumentation/modules/fixtures/use-hapi.js

const http = require('http');
const semver = require('semver');

const agent = require('../../../..');

const hapi = require('@hapi/hapi');

function handler(fn) {
  if (semver.satisfies(server.version, '>=17')) return fn;

  return function (request, reply) {
    var p = new Promise(function (resolve, reject) {
      resolve(fn(request));
    });
    p.then(reply, reply);
  };
}

function startServer() {
  if (semver.satisfies(server.version, '>=17')) return server.start();

  return new Promise(function (resolve, reject) {
    server.start(function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const server = hapi.server({ port: 3000 });
server.route({
  method: 'POST',
  path: '/hello/{name}',
  handler: handler(function (request) {
    return { hello: request.params.name };
  }),
});
server.route({
  method: 'GET',
  path: '/error',
  handler: handler(function (request) {
    const customError = new Error('custom request error');

    request.log(['elastic-apm', 'error'], customError);

    const stringError = 'custom error';

    request.log(['elastic-apm', 'error'], stringError);

    const objectError = {
      error: 'I forgot to turn this into an actual Error',
    };

    request.log(['elastic-apm', 'error'], objectError);

    throw new Error('foo');
  }),
});
server.route({
  method: 'GET',
  path: '/captureError',
  handler: handler(function (request) {
    agent.captureError(new Error());
    return '';
  }),
});

async function main() {
  await startServer();

  const customError = new Error('custom error');

  server.log(['error'], customError);

  const stringError = 'custom error';

  server.log(['error'], stringError);

  const objectError = {
    error: 'I forgot to turn this into an actual Error',
  };

  server.log(['error'], objectError);

  // Do a POST to test `captureBody`, wait for response, then exit.
  const port = server.info.port;

  await new Promise((resolve) => {
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
          resolve();
        });
      },
    );
    req.write(data);
    req.end();
  });

  await new Promise((resolve) => {
    const req = http.request(
      {
        method: 'GET',
        hostname: '127.0.0.1',
        port,
        path: '/error',
      },
      function (res) {
        console.log('client response:', res.statusCode, res.headers);
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          console.log('body:', body);
          resolve();
        });
      },
    );
    req.end();
  });

  await new Promise((resolve) => {
    const req = http.request(
      {
        method: 'GET',
        hostname: '127.0.0.1',
        port,
        path: '/captureError?foo=bar',
      },
      function (res) {
        console.log('client response:', res.statusCode, res.headers);
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          console.log('body:', body);
          resolve();
        });
      },
    );
    req.end();
  });

  server.stop();
}

main();
