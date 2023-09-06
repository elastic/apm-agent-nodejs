/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const { runTestFixtures } = require('../../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

const testFixtures = [
  {
    name: 'http.get ESM',
    script: './fixtures/use-http-get.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        3,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');

      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'manual', 'transaction.name');

      const span = apmServer.events[2].span;
      t.equal(span.name, 'GET www.google.com', 'span.name');
      t.equal(span.parent_id, trans.id, 'span.parent_id');
    },
  },
  {
    name: 'https.get ESM',
    script: './fixtures/use-https-get.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        3,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');

      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'manual', 'transaction.name');

      const span = apmServer.events[2].span;
      t.equal(span.name, 'GET www.google.com', 'span.name');
      t.equal(span.parent_id, trans.id, 'span.parent_id');
    },
  },
  {
    name: 'http.createServer ESM',
    script: './fixtures/use-http-server.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
      ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME: 'true',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        2,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');
      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'GET /', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
    },
  },
  {
    name: 'http.createServer ESM import()',
    script: './fixtures/use-dynamic-import.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
      ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME: 'true',
    },
    versionRanges: {
      node: '^14.13.1 || ^16.0.0 || ^18.1.0 <20', // NODE_VER_RANGE_IITM minus node v12 because top-level `await` is used
    },
    verbose: false,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        2,
        'expected number of APM server events',
      );
      t.ok(apmServer.events[0].metadata, 'metadata');
      const trans = apmServer.events[1].transaction;
      t.equal(trans.name, 'GET /', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
    },
  },
  {
    name: 'loading http from CJS and ESM works',
    script: './fixtures/load-http-twice.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
    },
    versionRanges: {
      node: '^14.13.1 || ^16.0.0 || ^18.1.0 <20', // NODE_VER_RANGE_IITM minus node v12 because top-level `await` is used
    },
    verbose: true,
  },
];

test('http/https ESM fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
