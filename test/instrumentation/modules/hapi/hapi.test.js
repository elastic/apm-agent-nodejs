/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const isHapiIncompat = require('../../../_is_hapi_incompat');
if (isHapiIncompat()) {
  // Skip out of this test.
  console.log(
    `# SKIP this version of @hapi/hapi is incompatible with node ${process.version}`,
  );
  process.exit();
}

const os = require('os');
const test = require('tape');

const { runTestFixtures } = require('../../../_utils');
const { NODE_VER_RANGE_IITM_GE14 } = require('../../../testconsts');

// Events order changes between node.js versions, but not inside each category of events,
// so sorting them per category allows for a more stable testing.
const sortEvents = (events) => {
  const getPriority = (obj) => {
    if ('metadata' in obj) return 0;
    if ('transaction' in obj) return 1;
    if ('error' in obj) return 2;
    return 3; // fallback for objects with none of these properties
  };

  return events.sort((a, b) => getPriority(a) - getPriority(b));
};

const testFixtures = [
  {
    name: 'hapi.js',
    script: '../fixtures/use-hapi.js',
    cwd: __dirname,
    env: {
      NODE_OPTIONS: '--require ../../../../start.js',
      ELASTIC_APM_CAPTURE_BODY: 'all',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      sortEvents(apmServer.events);
      t.equal(
        apmServer.events.length,
        12,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');

      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'POST /hello/?', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(
        trans.context.request.method,
        'POST',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.request.body,
        JSON.stringify({ foo: 'bar' }),
        'transaction.context.request.body',
      );

      const transError = apmServer.events[2].transaction;
      t.equal(transError.name, 'GET /error', 'transaction.name');
      t.equal(transError.type, 'request', 'transaction.type');
      t.equal(transError.outcome, 'failure', 'transaction.outcome');
      t.equal(
        transError.context.request.method,
        'GET',
        'transaction.context.request.method',
      );

      const transCaptureError = apmServer.events[3].transaction;
      t.equal(transCaptureError.name, 'GET /captureError', 'transaction.name');
      t.equal(transCaptureError.type, 'request', 'transaction.type');
      t.equal(transCaptureError.outcome, 'success', 'transaction.outcome');
      t.equal(
        transCaptureError.context.request.method,
        'GET',
        'transaction.context.request.method',
      );

      const customError = apmServer.events[4].error;
      t.ok(customError.exception);
      t.strictEqual(customError.exception.message, 'custom error');
      t.strictEqual(customError.exception.type, 'Error');
      t.ok(customError.context.custom);
      t.deepEqual(customError.context.custom.tags, ['error']);
      t.deepEqual(customError.context.custom.data, undefined);

      const stringError = apmServer.events[5].error;
      t.ok(stringError.log);
      t.strictEqual(stringError.log.message, 'custom error');
      t.ok(stringError.context);
      t.deepEqual(stringError.context.custom.tags, ['error']);
      t.deepEqual(stringError.context.custom.data, undefined);

      const objectError = apmServer.events[6].error;
      t.ok(objectError.log);
      t.strictEqual(
        objectError.log.message,
        'hapi server emitted a "log" event tagged "error"',
      );
      t.ok(objectError.context);
      t.deepEqual(objectError.context.custom.tags, ['error']);
      t.deepEqual(objectError.context.custom.data, {
        error: 'I forgot to turn this into an actual Error',
      });

      const requestError = apmServer.events[7].error;
      t.ok(requestError.exception);
      t.strictEqual(requestError.exception.message, 'custom request error');
      t.strictEqual(requestError.exception.type, 'Error');
      t.ok(requestError.context);
      t.deepEqual(requestError.context.custom.tags, ['elastic-apm', 'error']);
      t.deepEqual(requestError.context.custom.data, undefined);
      t.ok(requestError.context.request);

      const requestStringError = apmServer.events[8].error;
      t.ok(requestStringError.log);
      t.strictEqual(requestStringError.log.message, 'custom error');
      t.ok(requestStringError.context);
      t.deepEqual(requestStringError.context.custom.tags, [
        'elastic-apm',
        'error',
      ]);
      t.deepEqual(requestStringError.context.custom.data, undefined);
      t.ok(requestStringError.context.request);

      const requestObjectError = apmServer.events[9].error;
      t.ok(requestObjectError.log);
      t.strictEqual(
        requestObjectError.log.message,
        'hapi server emitted a "request" event tagged "error"',
      );
      t.ok(requestObjectError.context);
      t.deepEqual(requestObjectError.context.custom.tags, [
        'elastic-apm',
        'error',
      ]);
      t.deepEqual(requestObjectError.context.custom.data, {
        error: 'I forgot to turn this into an actual Error',
      });
      t.ok(requestObjectError.context.request);

      const handlerError = apmServer.events[10].error;
      t.strictEqual(handlerError.context.request.method, 'GET');
      t.strictEqual(handlerError.context.request.url.pathname, '/error');
      t.strictEqual(handlerError.context.request.url.search, undefined);
      t.strictEqual(handlerError.context.request.url.raw, '/error');
      t.strictEqual(handlerError.context.request.url.hostname, '127.0.0.1');
      t.strictEqual(handlerError.context.request.url.port, '3000');

      const capturedError = apmServer.events[11].error;
      t.strictEqual(capturedError.context.request.method, 'GET');
      t.strictEqual(
        capturedError.context.request.url.pathname,
        '/captureError',
      );
      t.strictEqual(capturedError.context.request.url.search, '?foo=bar');
      t.strictEqual(
        capturedError.context.request.url.raw,
        '/captureError?foo=bar',
      );
      t.strictEqual(capturedError.context.request.url.hostname, '127.0.0.1');
      t.strictEqual(capturedError.context.request.url.port, '3000');
    },
  },
  {
    name: 'hapi.js ESM',
    script: '../fixtures/use-hapi.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
      ELASTIC_APM_CAPTURE_BODY: 'all',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM_GE14,
    },
    testOpts: {
      // The loader doesn't seem to instrument hapi when on windows
      skip: os.platform() === 'win32',
    },
    checkApmServer: (t, apmServer) => {
      sortEvents(apmServer.events);
      t.equal(
        apmServer.events.length,
        12,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');

      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'POST /hello/?', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(
        trans.context.request.method,
        'POST',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.request.body,
        JSON.stringify({ foo: 'bar' }),
        'transaction.context.request.body',
      );

      const transError = apmServer.events[2].transaction;
      t.equal(transError.name, 'GET /error', 'transaction.name');
      t.equal(transError.type, 'request', 'transaction.type');
      t.equal(transError.outcome, 'failure', 'transaction.outcome');
      t.equal(
        transError.context.request.method,
        'GET',
        'transaction.context.request.method',
      );

      const transCaptureError = apmServer.events[3].transaction;
      t.equal(transCaptureError.name, 'GET /captureError', 'transaction.name');
      t.equal(transCaptureError.type, 'request', 'transaction.type');
      t.equal(transCaptureError.outcome, 'success', 'transaction.outcome');
      t.equal(
        transCaptureError.context.request.method,
        'GET',
        'transaction.context.request.method',
      );

      const customError = apmServer.events[4].error;
      t.ok(customError.exception);
      t.strictEqual(customError.exception.message, 'custom error');
      t.strictEqual(customError.exception.type, 'Error');
      t.ok(customError.context.custom);
      t.deepEqual(customError.context.custom.tags, ['error']);
      t.deepEqual(customError.context.custom.data, undefined);

      const stringError = apmServer.events[5].error;
      t.ok(stringError.log);
      t.strictEqual(stringError.log.message, 'custom error');
      t.ok(stringError.context);
      t.deepEqual(stringError.context.custom.tags, ['error']);
      t.deepEqual(stringError.context.custom.data, undefined);

      const objectError = apmServer.events[6].error;
      t.ok(objectError.log);
      t.strictEqual(
        objectError.log.message,
        'hapi server emitted a "log" event tagged "error"',
      );
      t.ok(objectError.context);
      t.deepEqual(objectError.context.custom.tags, ['error']);
      t.deepEqual(objectError.context.custom.data, {
        error: 'I forgot to turn this into an actual Error',
      });

      const requestError = apmServer.events[7].error;
      t.ok(requestError.exception);
      t.strictEqual(requestError.exception.message, 'custom request error');
      t.strictEqual(requestError.exception.type, 'Error');
      t.ok(requestError.context);
      t.deepEqual(requestError.context.custom.tags, ['elastic-apm', 'error']);
      t.deepEqual(requestError.context.custom.data, undefined);
      t.ok(requestError.context.request);

      const requestStringError = apmServer.events[8].error;
      t.ok(requestStringError.log);
      t.strictEqual(requestStringError.log.message, 'custom error');
      t.ok(requestStringError.context);
      t.deepEqual(requestStringError.context.custom.tags, [
        'elastic-apm',
        'error',
      ]);
      t.deepEqual(requestStringError.context.custom.data, undefined);
      t.ok(requestStringError.context.request);

      const requestObjectError = apmServer.events[9].error;
      t.ok(requestObjectError.log);
      t.strictEqual(
        requestObjectError.log.message,
        'hapi server emitted a "request" event tagged "error"',
      );
      t.ok(requestObjectError.context);
      t.deepEqual(requestObjectError.context.custom.tags, [
        'elastic-apm',
        'error',
      ]);
      t.deepEqual(requestObjectError.context.custom.data, {
        error: 'I forgot to turn this into an actual Error',
      });
      t.ok(requestObjectError.context.request);

      const handlerError = apmServer.events[10].error;
      t.strictEqual(handlerError.context.request.method, 'GET');
      t.strictEqual(handlerError.context.request.url.pathname, '/error');
      t.strictEqual(handlerError.context.request.url.search, undefined);
      t.strictEqual(handlerError.context.request.url.raw, '/error');
      t.strictEqual(handlerError.context.request.url.hostname, '127.0.0.1');
      t.strictEqual(handlerError.context.request.url.port, '3000');

      const capturedError = apmServer.events[11].error;
      t.strictEqual(capturedError.context.request.method, 'GET');
      t.strictEqual(
        capturedError.context.request.url.pathname,
        '/captureError',
      );
      t.strictEqual(capturedError.context.request.url.search, '?foo=bar');
      t.strictEqual(
        capturedError.context.request.url.raw,
        '/captureError?foo=bar',
      );
      t.strictEqual(capturedError.context.request.url.hostname, '127.0.0.1');
      t.strictEqual(capturedError.context.request.url.port, '3000');
    },
  },
  {
    name: 'hapi.js connectionless',
    script: '../fixtures/use-hapi-connectionless.js',
    cwd: __dirname,
    env: {
      NODE_OPTIONS: '--require ../../../../start.js',
      ELASTIC_APM_CAPTURE_BODY: 'all',
    },
    versionRanges: {
      '@hapi/hapi': '>=15.0.2',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      sortEvents(apmServer.events);
      t.equal(
        apmServer.events.length,
        4,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');

      const customError = apmServer.events[1].error;
      t.ok(customError.exception);
      t.strictEqual(customError.exception.message, 'custom error');
      t.strictEqual(customError.exception.type, 'Error');
      t.ok(customError.context.custom);
      t.deepEqual(customError.context.custom.tags, ['error']);
      t.deepEqual(customError.context.custom.data, undefined);

      const stringError = apmServer.events[2].error;
      t.ok(stringError.log);
      t.strictEqual(stringError.log.message, 'custom error');
      t.ok(stringError.context);
      t.deepEqual(stringError.context.custom.tags, ['error']);
      t.deepEqual(stringError.context.custom.data, undefined);

      const objectError = apmServer.events[3].error;
      t.ok(objectError.log);
      t.strictEqual(
        objectError.log.message,
        'hapi server emitted a "log" event tagged "error"',
      );
      t.ok(objectError.context);
      t.deepEqual(objectError.context.custom.tags, ['error']);
      t.deepEqual(objectError.context.custom.data, {
        error: 'I forgot to turn this into an actual Error',
      });
    },
  },
];

test('hapi fixtures', function (suite) {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
