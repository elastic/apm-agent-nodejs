/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (require('os').platform() === 'win32') {
  console.log('This test file does not support Windows - aborting...');
  process.exit();
}

const http = require('http');
const zlib = require('zlib');

const afterAll = require('after-all-results');
const ndjson = require('ndjson');
const test = require('tape');

const utils = require('./_utils');
const Agent = require('../../_agent');

const next = afterAll(function (err, validators) {
  if (err) throw err;

  const [validateMetadata, validateError] = validators;

  const errors = [new Error('foo'), 'just a string'];
  errors.forEach(function (error, index) {
    test(
      'error schema - captureErrorLogStackTraces: true - ' + index,
      function (t) {
        t.plan(7);

        let agent;
        const validators = [validateMetadata, validateError];

        const server = http.createServer(function (req, res) {
          t.strictEqual(
            req.method,
            'POST',
            'server should recieve a POST request',
          );
          t.strictEqual(
            req.url,
            '/intake/v2/events',
            'server should recieve request to correct endpoint',
          );

          req
            .pipe(zlib.createGunzip())
            .pipe(ndjson.parse())
            .on('data', function (data) {
              const type = Object.keys(data)[0];
              const validate = validators.shift();
              t.strictEqual(
                validate(data[type]),
                true,
                type + ' should be valid',
              );
              t.strictEqual(
                validate.errors,
                null,
                type + ' should not have any validation errors',
              );
            })
            .on('end', function () {
              res.end();
            });
        });

        server.listen(function () {
          agent = newAgent(server);
          agent.captureError(error, function (err) {
            t.error(err, 'captureError should not result in an error');
            server.close();
            agent.destroy();
            t.end();
          });
        });
      },
    );
  });
});

utils.metadataValidator(next());
utils.errorValidator(next());

function newAgent(server) {
  return new Agent().start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + server.address().port,
    captureExceptions: false,
    disableInstrumentations: ['http'],
    captureErrorLogStackTraces: true,
    metricsInterval: 0,
    apmServerVersion: '8.0.0',
    centralConfig: false,
  });
}
