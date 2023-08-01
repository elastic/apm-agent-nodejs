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
const findObjInArray = require('../../_utils').findObjInArray;

const next = afterAll(function (err, validators) {
  if (err) throw err;

  const [validateMetadata, validateTransaction, validateSpan, validateError] =
    validators;

  test('metadata schema failure', function (t) {
    t.strictEqual(validateMetadata({}), false);
    validateFieldMessages(t, validateMetadata.errors, [
      { message: "should have required property 'service'" },
    ]);
    t.end();
  });

  test('transaction schema failure', function (t) {
    t.strictEqual(validateTransaction({}), false);
    validateFieldMessages(t, validateTransaction.errors, [
      { message: "should have required property 'duration'" },
      { message: "should have required property 'id'" },
      { message: "should have required property 'span_count'" },
      { message: "should have required property 'trace_id'" },
      { message: "should have required property 'type'" },
    ]);
    t.end();
  });

  test('span schema failure', function (t) {
    t.strictEqual(validateSpan({}), false);
    validateFieldMessages(t, validateSpan.errors, [
      { message: "should have required property 'duration'" },
      { message: "should have required property 'id'" },
      { message: "should have required property 'name'" },
      { message: "should have required property 'parent_id'" },
      { message: "should have required property 'trace_id'" },
      { message: "should have required property 'type'" },
      { message: "should have required property 'start'" },
      { message: "should have required property 'timestamp'" },
      { message: 'should match some schema in anyOf' },
    ]);
    t.end();
  });

  test('error schema failure', function (t) {
    t.strictEqual(validateError({}), false);
    validateFieldMessages(t, validateError.errors, [
      { message: "should have required property 'id'" },
      { message: "should have required property 'exception'" },
      { message: "should have required property 'log'" },
      { message: 'should match some schema in anyOf' },
    ]);

    t.strictEqual(validateError({ id: 'foo', exception: {} }), false);
    validateFieldMessages(t, validateError.errors, [
      {
        dataPath: '/exception',
        params: { missingProperty: 'message' },
        message: "should have required property 'message'",
      },
      {
        dataPath: '/exception',
        params: { missingProperty: 'type' },
        message: "should have required property 'type'",
      },
      {
        dataPath: '/exception',
        params: {},
        message: 'should match some schema in anyOf',
      },
    ]);

    t.strictEqual(validateError({ id: 'foo', log: {} }), false);
    validateFieldMessages(t, validateError.errors, [
      {
        dataPath: '/log',
        params: { missingProperty: 'message' },
        message: "should have required property 'message'",
      },
    ]);
    t.end();
  });

  test('metadata + transaction schema', function (t) {
    t.plan(7);

    let agent;
    const validators = [validateMetadata, validateTransaction];

    const server = http.createServer(function (req, res) {
      t.strictEqual(req.method, 'POST', 'server should recieve a POST request');
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
          t.strictEqual(validate(data[type]), true, type + ' should be valid');
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
      agent.startTransaction('name1', 'type1');
      agent.endTransaction();
      agent.flush(function (err) {
        t.error(err, 'flush should not result in an error');
        server.close();
        agent.destroy();
        t.end();
      });
    });
  });

  test('metadata + span schema', function (t) {
    t.plan(7);

    let agent;
    const validators = [validateMetadata, validateSpan];

    const server = http.createServer(function (req, res) {
      t.strictEqual(req.method, 'POST', 'server should recieve a POST request');
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
          t.strictEqual(validate(data[type]), true, type + ' should be valid');
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
      agent.startTransaction();
      const span = agent.startSpan('name1', 'type1');
      span.setDbContext({ statement: 'foo', type: 'bar' });
      span.setLabel('baz', 1);
      span.end();
      agent.flush(function (err) {
        t.error(err, 'flush should not result in an error');
        server.close();
        agent.destroy();
        t.end();
      });
    });
  });

  const errors = [new Error('foo'), 'just a string'];
  errors.forEach(function (error, index) {
    test('metadata + error schema - ' + index, function (t) {
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
    });
  });
});

utils.metadataValidator(next());
utils.transactionValidator(next());
utils.spanValidator(next());
utils.errorValidator(next());

function validateFieldMessages(t, errors, expectations) {
  t.strictEqual(
    errors.length,
    expectations.length,
    'got expected number of errors',
  );
  expectations.forEach((expected) => {
    // Attempt to find the matching error object by 'message'. In general
    // this *could* be ambiguous, but should suffice here.
    const actual = findObjInArray(errors, 'message', expected.message);
    if (!actual) {
      t.fail(`errors include message "${expected.message}"`);
    } else {
      Object.keys(expected).forEach((field) => {
        t.deepEqual(
          actual[field],
          expected[field],
          `actual error field "${field}" matches ` +
            JSON.stringify(expected[field]),
        );
      });
    }
  });
}

function newAgent(server) {
  return new Agent().start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + server.address().port,
    captureExceptions: false,
    disableInstrumentations: ['http'],
    apmServerVersion: '8.0.0',
    metricsInterval: 0,
    centralConfig: false,
  });
}
