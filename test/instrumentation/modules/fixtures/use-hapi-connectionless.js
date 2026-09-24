/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Usage:
//    node --require=./start.js test/instrumentation/modules/fixtures/use-hapi-connectionless.js

const semver = require('semver');

const hapi = require('@hapi/hapi');

const server = hapi.server();

async function main() {
  if (semver.satisfies(server.version, '<17')) {
    await new Promise((resolve, reject) =>
      server.initialize(function (err) {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      }),
    );
  } else {
    await server.initialize();
  }

  const customError = new Error('custom error');

  server.log(['error'], customError);

  const stringError = 'custom error';

  server.log(['error'], stringError);

  const objectError = {
    error: 'I forgot to turn this into an actual Error',
  };

  server.log(['error'], objectError);

  await server.stop();
}

main();
