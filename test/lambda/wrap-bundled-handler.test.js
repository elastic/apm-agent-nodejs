/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the automatic wrapping of a Lambda handler module created by
//    esbuild foo.ts --platform=node --bundle
// as is done by a Serverless Framework project using TypeScript.
// The created module exports its properties only with a getter, so wrapping
// of the handler cannot modify the module object directly.

const tape = require('tape');
const path = require('path');

tape.test(
  'automatic wrapping of _HANDLER=esbuild-bundled-handler/hello.main',
  function (t) {
    if (process.platform === 'win32') {
      t.pass('skipping for windows');
      t.end();
      return;
    }

    // Fake the Lambda enviornment.
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'main';
    process.env.LAMBDA_TASK_ROOT = path.join(__dirname, 'fixtures');
    process.env._HANDLER = 'esbuild-bundled-handler/hello.main';

    // Start The Real agent.
    require('../..').start({
      serviceName: 'lambda test',
      breakdownMetrics: false,
      captureExceptions: false,
      metricsInterval: '0s',
      centralConfig: false,
      cloudProvider: 'none',
      spanStackTraceMinDuration: 0, // Always have span stacktraces.
      disableSend: true,
    });

    // Load express after the agent has started.
    const express = require('express');

    const handler = require(path.join(
      __dirname,
      'fixtures/esbuild-bundled-handler/hello',
    )).main;
    t.equals(
      handler.name,
      'wrappedLambdaHandler',
      'handler function wrapped correctly',
    );

    // Did normal patching/wrapping take place?
    t.equals(
      express.static.name,
      'wrappedStatic',
      'express module was instrumented correctly',
    );
    t.end();
  },
);
