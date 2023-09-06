/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that the "metadata" sent to APM server from a lambda invocation
// respects the `serviceName` and `serviceVersion` config settings.

const lambdaLocal = require('lambda-local');
const tape = require('tape');

const apm = require('../../');
const { MockAPMServer } = require('../_mock_apm_server');

// Setup env for both apm.start() and lambdaLocal.execute().
process.env.AWS_LAMBDA_FUNCTION_NAME = 'fixture-function-name';
// Set these values to have stable data from lambdaLocal.execute().
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCOUNT_ID = '123456789012';
// A lambda-local limitation is that it doesn't set AWS_LAMBDA_LOG_GROUP_NAME
// and AWS_LAMBDA_LOG_STREAM_NAME (per
// https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html).
process.env.AWS_LAMBDA_LOG_GROUP_NAME = `/aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME}`;
process.env.AWS_LAMBDA_LOG_STREAM_NAME =
  '2021/11/01/[1.0]lambda/e7b05091b39b4aa2aef19efe4d262e79';
// Avoid the lambda-local loading AWS credentials and session info from
// a configured real AWS profile and possibly emitting this warning:
//    warning Using both auth systems: aws_access_key/id and secret_access_token!
process.env.AWS_PROFILE = 'fake';

tape.test('lambda metadata respects config settings', function (suite) {
  let server;
  let serverUrl;

  suite.test('setup', function (t) {
    server = new MockAPMServer();
    server.start(function (serverUrl_) {
      serverUrl = serverUrl_;
      t.comment('mock APM serverUrl: ' + serverUrl);
      apm.start({
        serverUrl,
        logLevel: 'off',
        captureExceptions: false,
        serviceName: 'my-service',
        serviceVersion: '1.2.3',
      });
      t.comment('APM agent started');
      t.end();
    });
  });

  suite.test('metadata includes first fn invocation info', function (t) {
    const input = { name: 'Bob' };
    const handler = apm.lambda((event, _context, cb) => {
      cb(null, `Hi, ${event.name}!`);
    });

    lambdaLocal.execute({
      event: input,
      lambdaFunc: {
        [process.env.AWS_LAMBDA_FUNCTION_NAME]: handler,
      },
      lambdaHandler: process.env.AWS_LAMBDA_FUNCTION_NAME,
      timeoutMs: 3000,
      verboseLevel: 0,
      callback: function (err, result) {
        t.error(
          err,
          `no error from executing the lambda handler: err=${JSON.stringify(
            err,
          )}`,
        );

        var metadata = server.events[0].metadata;
        t.ok(metadata, 'got metadata');
        t.same(
          metadata.service.name,
          'my-service',
          'service.name from serviceName config',
        );
        t.same(
          metadata.service.version,
          '1.2.3',
          'service.version from serviceVersion config',
        );

        t.end();
      },
    });
  });

  suite.test('teardown', function (t) {
    server.close();
    t.end();
    apm.destroy();
  });

  suite.end();
});
