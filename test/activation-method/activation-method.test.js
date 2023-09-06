/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test determination of the Agent activation method used for the
// 'system.agent.activation_method' metadatum.

const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const semver = require('semver');
const tape = require('tape');

const { formatForTComment } = require('../_utils');
const { MockAPMServer } = require('../_mock_apm_server');

const fixturesDir = path.join(__dirname, 'fixtures');

// ---- tests

// We need to `npm install` for a first test run.
const haveNodeModules = fs.existsSync(path.join(fixturesDir, 'node_modules'));
tape.test(
  `setup: npm install (in ${fixturesDir})`,
  { skip: haveNodeModules },
  (t) => {
    const startTime = Date.now();
    exec(
      'npm install',
      {
        cwd: fixturesDir,
      },
      function (err, stdout, stderr) {
        t.error(
          err,
          `"npm install" succeeded (took ${(Date.now() - startTime) / 1000}s)`,
        );
        if (err) {
          t.comment(
            `$ npm install\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`,
          );
        }
        t.end();
      },
    );
  },
);

tape.test('metadata.system.agent.activation_method fixtures', function (suite) {
  // Note: We do not test the "aws-lambda-layer" case, because this would
  // require simulating an agent install to the special path used in that case.
  var cases = [
    {
      script: 'require1.js',
      expectedMethod: 'require',
    },
    {
      script: 'require2.js',
      expectedMethod: 'require',
    },
    {
      nodeVerRange: '>=v12.17.0', // when `--experimental-modules` flag was removed
      script: 'import1.mjs',
      expectedMethod: 'import',
    },
    {
      nodeVerRange: '>=v12.17.0', // when `--experimental-modules` flag was removed
      script: 'import2.mjs',
      expectedMethod: 'import',
    },
    {
      script: 'hi.js',
      nodeOpts: ['-r', 'elastic-apm-node/start'],
      expectedMethod: 'preload',
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '-r elastic-apm-node/start',
        ELASTIC_APM_ACTIVATION_METHOD: 'K8S',
      },
      expectedMethod: 'k8s-attach',
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '-r elastic-apm-node/start',
      },
      expectedMethod: 'env-attach',
    },
    {
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '-r elastic-apm-node/start.js',
      },
      expectedMethod: 'env-attach',
    },
    {
      nodeVerRange: '>=10.10.0', // when `--require=...` support was added
      script: 'hi.js',
      env: {
        NODE_OPTIONS: '--require=elastic-apm-node/start',
      },
      expectedMethod: 'env-attach',
    },
  ];

  cases.forEach((c) => {
    if (
      c.nodeVerRange &&
      !semver.satisfies(process.version, c.nodeVerRange, {
        includePrerelease: true,
      })
    ) {
      return;
    }

    const envStr = c.env
      ? Object.keys(c.env)
          .map((k) => `${k}="${c.env[k]}"`)
          .join(' ')
      : '';
    suite.test(
      `${envStr} node ${(c.nodeOpts || []).join(' ')} ${c.script}`,
      (t) => {
        const server = new MockAPMServer({ apmServerVersion: '8.7.1' });
        const args = c.nodeOpts || [];
        args.push(c.script);
        server.start(function (serverUrl) {
          execFile(
            process.execPath,
            args,
            {
              cwd: fixturesDir,
              timeout: 10000, // sanity stop, 3s is sometimes too short for CI
              env: Object.assign(
                {},
                process.env,
                {
                  ELASTIC_APM_SERVER_URL: serverUrl,
                },
                c.env || {},
              ),
            },
            function done(err, stdout, stderr) {
              t.error(err, 'ran successfully');
              if (err) {
                t.comment(
                  `$ node ${c.script}\n-- stdout --\n|${formatForTComment(
                    stdout,
                  )}\n-- stderr --\n|${formatForTComment(stderr)}\n--`,
                );
              }
              const metadata = server.events[0].metadata;
              t.equal(
                metadata.service.agent.activation_method,
                c.expectedMethod,
                `metadata.service.agent.activation_method === ${c.expectedMethod}`,
              );
              server.close();
              t.end();
            },
          );
        });
      },
    );
  });

  suite.end();
});
