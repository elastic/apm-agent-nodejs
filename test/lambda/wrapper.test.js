/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const tape = require('tape');
const path = require('path');
const Instrumentation = require('../../lib/instrumentation');
const logging = require('../../lib/logging');
const { getLambdaHandlerInfo } = require('../../lib/lambda');

const MODULES = Instrumentation.modules;
tape.test('unit tests for getLambdaHandlerInfo', function (suite) {
  const logger = logging.createLogger('off');
  // minimal mocked instrumentation object for unit tests
  suite.test('returns false-ish in non-lambda places', function (t) {
    t.ok(!getLambdaHandlerInfo());
    t.end();
  });

  suite.test('extracts info with expected env variables', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo(
      {
        _HANDLER: 'lambda.bar',
        LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
      },
      MODULES,
      logger,
    );

    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'lambda.js'),
      'extracted handler file path',
    );
    t.equals(handler.module, 'lambda', 'extracted handler module');
    t.equals(handler.field, 'bar', 'extracted handler field');
    t.end();
  });

  suite.test('extracts info with extended path, cjs extension', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo(
      {
        _HANDLER: 'handlermodule.lambda.bar',
        LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
      },
      MODULES,
      logger,
    );

    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'handlermodule.cjs'),
      'extracted handler file path',
    );
    t.equals(handler.module, 'handlermodule', 'extracted handler module');
    t.equals(handler.field, 'lambda.bar', 'extracted handler field');
    t.end();
  });

  suite.test('extracts info with expected env variables', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo(
      {
        _HANDLER: 'lambda.bar',
        LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
      },
      MODULES,
      logger,
    );
    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'lambda.js'),
      'extracted handler file path',
    );
    t.equals(handler.module, 'lambda', 'extracted handler module');
    t.equals(handler.field, 'bar', 'extracted handler field');
    t.end();
  });

  suite.test(
    'returns no value if module name conflicts with already instrumented module',
    function (t) {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
      const handler = getLambdaHandlerInfo(
        {
          _HANDLER: 'express.bar',
          LAMBDA_TASK_ROOT: '/var/task',
        },
        MODULES,
        logger,
      );
      t.equals(handler, undefined, 'no handler extracted');
      t.end();
    },
  );

  suite.test('no task root', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo(
      {
        _HANDLER: 'foo.bar',
      },
      MODULES,
      logger,
    );
    t.ok(!handler, 'no value when task root missing');
    t.end();
  });

  suite.test('no handler', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo(
      {
        LAMBDA_TASK_ROOT: '/var/task',
      },
      MODULES,
      logger,
    );
    t.ok(!handler, 'no value when handler missing');
    t.end();
  });

  suite.test('malformed handler: too few', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo(
      {
        LAMBDA_TASK_ROOT: '/var/task',
        _HANDLER: 'foo',
      },
      MODULES,
      logger,
    );

    t.ok(!handler, 'no value for malformed handler too few');
    t.end();
  });

  suite.test('longer handler', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo(
      {
        LAMBDA_TASK_ROOT: '/var/task',
        _HANDLER: 'foo.baz.bar',
      },
      MODULES,
      logger,
    );

    t.equals(
      handler.filePath,
      path.resolve('/var', 'task', 'foo.cjs'),
      'extracted handler file path',
    );
    t.equals(handler.module, 'foo', 'extracted handler module');
    t.equals(handler.field, 'baz.bar', 'extracted handler field');
    t.end();
  });

  suite.end();
});

tape.test('integration test', function (t) {
  if (process.platform === 'win32') {
    t.pass('skipping for windows');
    t.end();
    return;
  }
  // fake the enviornment
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
  process.env.LAMBDA_TASK_ROOT = path.join(__dirname, 'fixtures');
  process.env._HANDLER = 'lambda.foo';

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
