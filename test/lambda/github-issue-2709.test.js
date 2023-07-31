/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const tape = require('tape');
const path = require('path');

tape.test('test _HANDLER=fixture/lambda.foo form', function (t) {
  if (process.platform === 'win32') {
    t.pass('skipping for windows');
    t.end();
    return;
  }
  // fake the enviornment
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
  process.env.LAMBDA_TASK_ROOT = __dirname;
  process.env._HANDLER = 'fixtures/lambda.foo';

  // load and start The Real agent
  require('../..').start({
    serviceName: 'lambda test',
    breakdownMetrics: false,
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    cloudProvider: 'none',
    spanStackTraceMinDuration: 0, // Always have span stacktraces.
    transport: function () {},
  });

  // load express after agent (for wrapper checking)
  const express = require('express');

  // check that the handler fixture is wrapped
  const handler = require(path.join(__dirname, '/fixtures/lambda')).foo;
  t.equals(
    handler.name,
    'wrappedLambdaHandler',
    'handler function wrapped correctly',
  );

  // did normal patching/wrapping take place
  t.equals(
    express.static.name,
    'wrappedStatic',
    'express module was instrumented correctly',
  );
  t.end();
});
