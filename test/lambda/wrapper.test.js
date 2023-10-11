/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const path = require('path');

const tape = require('tape');

const { getLambdaHandlerInfo } = require('../../lib/lambda');
const apm = require('../..');

tape.test('getLambdaHandlerInfo', function (suite) {
  suite.test('returns false-ish in non-lambda places', function (t) {
    t.ok(!getLambdaHandlerInfo());
    t.end();
  });

  suite.test('extracts info with expected env variables', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo({
      _HANDLER: 'lambda.bar',
      LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
    });

    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'lambda.js'),
      'extracted handler file path',
    );
    t.equals(handler.modName, 'lambda', 'extracted handler module');
    t.equals(handler.propPath, 'bar', 'extracted handler propPath');
    t.end();
  });

  suite.test('extracts info with extended path, cjs extension', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo({
      _HANDLER: 'handlermodule.lambda.bar',
      LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
    });

    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'handlermodule.cjs'),
      'extracted handler file path',
    );
    t.equals(handler.modName, 'handlermodule', 'extracted handler module');
    t.equals(handler.propPath, 'lambda.bar', 'extracted handler propPath');
    t.end();
  });

  suite.test('extracts info with expected env variables', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';

    const handler = getLambdaHandlerInfo({
      _HANDLER: 'lambda.bar',
      LAMBDA_TASK_ROOT: path.resolve(__dirname, 'fixtures'),
    });
    t.equals(
      handler.filePath,
      path.resolve(__dirname, 'fixtures', 'lambda.js'),
      'extracted handler file path',
    );
    t.equals(handler.modName, 'lambda', 'extracted handler module');
    t.equals(handler.propPath, 'bar', 'extracted handler propPath');
    t.end();
  });

  suite.test('no task root', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo({
      _HANDLER: 'foo.bar',
    });
    t.ok(!handler, 'no value when task root missing');
    t.end();
  });

  suite.test('no handler', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo({
      LAMBDA_TASK_ROOT: '/var/task',
    });
    t.ok(!handler, 'no value when handler missing');
    t.end();
  });

  suite.test('malformed handler: too few', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo({
      LAMBDA_TASK_ROOT: '/var/task',
      _HANDLER: 'foo',
    });

    t.ok(!handler, 'no value for malformed handler too few');
    t.end();
  });

  suite.test('longer handler', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo';
    const handler = getLambdaHandlerInfo({
      LAMBDA_TASK_ROOT: '/var/task',
      _HANDLER: 'foo.baz.bar',
    });

    t.equals(
      handler.filePath,
      path.resolve('/var', 'task', 'foo.cjs'),
      'extracted handler file path',
    );
    t.equals(handler.modName, 'foo', 'extracted handler module name');
    t.equals(handler.propPath, 'baz.bar', 'extracted handler property path');
    t.end();
  });

  suite.end();
});

tape.test('lambda handler wrapping', function (t) {
  if (process.platform === 'win32') {
    t.pass('skipping for windows');
    t.end();
    return;
  }
  // fake the enviornment
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'mylambdafnname';
  process.env.LAMBDA_TASK_ROOT = path.join(__dirname, 'fixtures');
  process.env._HANDLER = 'lambda.foo';

  // load and start The Real agent
  apm.start({
    serviceName: 'lambda-test',
    breakdownMetrics: false,
    captureExceptions: false,
    metricsInterval: '0s',
    centralConfig: false,
    cloudProvider: 'none',
    disableSend: true,
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

  apm.destroy();
  t.end();
});

tape.test('not wrapped if _HANDLER module is a name conflict', function (t) {
  if (process.platform === 'win32') {
    t.pass('skipping for windows');
    t.end();
    return;
  }
  // fake the enviornment
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'mylambdafnname';
  process.env.LAMBDA_TASK_ROOT = path.join(__dirname, 'fixtures');
  process.env._HANDLER = 'express.foo';

  apm.start({
    serviceName: 'lambda-test',
    breakdownMetrics: false,
    captureExceptions: false,
    metricsInterval: '0s',
    centralConfig: false,
    cloudProvider: 'none',
    disableSend: true,
  });

  const express = require('express');
  t.equals(
    express.static.name,
    'wrappedStatic',
    'express module was instrumented correctly',
  );

  const handler = require(path.join(__dirname, '/fixtures/express')).foo;
  t.equals(
    handler.name,
    'origHandlerFuncName',
    'handler function was not wrapped',
  );

  apm.destroy();
  t.end();
});
