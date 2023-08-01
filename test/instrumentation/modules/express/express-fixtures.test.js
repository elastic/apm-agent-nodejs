/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const os = require('os');
const test = require('tape');

const { runTestFixtures, sortApmEvents } = require('../../../_utils');
const { NODE_VER_RANGE_IITM } = require('../../../testconsts');

const testFixtures = [
  {
    name: 'express ESM',
    script: '../fixtures/use-express.mjs',
    cwd: __dirname,
    env: {
      NODE_OPTIONS:
        '--experimental-loader=../../../../loader.mjs --require=../../../../start.js',
      NODE_NO_WARNINGS: '1', // skip warnings about --experimental-loader
      ELASTIC_APM_CAPTURE_BODY: 'all',
    },
    versionRanges: {
      node: NODE_VER_RANGE_IITM,
    },
    testOpts: {
      skip:
        // No point in supporting with contextManager=patch.
        process.env.ELASTIC_APM_CONTEXT_MANAGER === 'patch' ||
        // The `express.static()` path config doesn't work on windows. Meh windows.
        os.platform() === 'win32',
    },
    verbose: true,
    checkApmServer: (t, apmServer) => {
      t.equal(
        apmServer.events.length,
        3,
        'expected number of APM server events',
      );
      const metadata = apmServer.events[0].metadata;
      t.ok(metadata, 'metadata');
      t.equal(
        metadata.service.framework.name,
        'express',
        'metadata.service.framework.name',
      );

      const events = sortApmEvents(apmServer.events);
      let trans = events[0].transaction;
      t.equal(trans.name, 'GET static file', 'transaction.name');

      trans = events[1].transaction;
      t.equal(trans.name, 'POST /hello/:name', 'transaction.name');
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
    },
  },
];

test('express fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
