/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that a lambda invocation sends the appropriate "metadata" to APM server.

const lambdaLocal = require('lambda-local');
const tape = require('tape');

const apm = require('../../');
const { MockAPMServer } = require('../_mock_apm_server');
const { isLambdaExecutionEnvironment } = require('../../lib/lambda');

// Setup env for both apm.start() and lambdaLocal.execute().
process.env.AWS_LAMBDA_FUNCTION_NAME = 'fixture-function-name';
process.env.AWS_LAMBDA_FUNCTION_VERSION = '42';
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

tape.test('isLambdaExecutionEnvironment', function (t) {
  const savedFnName = process.env.AWS_LAMBDA_FUNCTION_NAME;

  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  t.strictEquals(
    isLambdaExecutionEnvironment(),
    false,
    'execution environment not detected',
  );

  process.env.AWS_LAMBDA_FUNCTION_NAME = savedFnName;
  t.strictEquals(
    isLambdaExecutionEnvironment(),
    true,
    'execution environment detected',
  );
  t.end();
});

tape.test('lambda config & metadata tests', function (suite) {
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
      });
      t.comment('APM agent started');
      t.end();
    });
  });

  suite.test('config defaults in lambda environment', function (t) {
    t.strictEqual(apm._conf.metricsInterval, 0, 'metricsInterval=0');
    t.strictEqual(apm._conf.centralConfig, false, 'centralConfig=false');
    t.strictEqual(apm._conf.cloudProvider, 'none', 'cloudProvider="none"');
    t.notOk(
      apm._apmClient._conf.cloudMetadataFetcher,
      'no cloudMetadataFetcher is given to the transport in a Lambda env',
    );
    t.end();
  });

  suite.test('metadata includes first fn invocation info', function (t) {
    const input = { name: 'Bob' };
    const output = 'Hi, Bob!';
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
        t.strictEqual(result, output);

        var metadata = server.events[0].metadata;
        t.ok(metadata, 'got metadata');
        t.same(
          metadata.service.name,
          process.env.AWS_LAMBDA_FUNCTION_NAME,
          'service.name',
        );
        t.same(metadata.service.version, '42', 'service.version');
        t.same(
          metadata.service.framework.name,
          'AWS Lambda',
          'service.framework.name',
        );
        t.same(
          metadata.service.runtime.name,
          process.env.AWS_EXECUTION_ENV,
          'service.runtime.name',
        );
        t.same(
          metadata.service.node.configured_name,
          process.env.AWS_LAMBDA_LOG_STREAM_NAME,
          'service.node.configured_name',
        );
        t.same(metadata.cloud.provider, 'aws', 'cloud.provider');
        t.same(metadata.cloud.region, process.env.AWS_REGION, 'cloud.region');
        t.same(metadata.cloud.service.name, 'lambda', 'cloud.service.name');
        t.same(
          metadata.cloud.account.id,
          process.env.AWS_ACCOUNT_ID,
          'cloud.account.id',
        );

        t.end();
      },
    });
  });

  suite.test(
    'should not be a central config request to APM server',
    function (t) {
      const centralConfigReqs = server.requests.filter(
        (r) => r.method === 'GET' && r.url.startsWith('/config/v1/agents'),
      );
      t.equal(
        centralConfigReqs.length,
        0,
        'no GET /config/v1/agents requests to APM server',
      );
      t.end();
    },
  );

  suite.test('teardown', function (t) {
    server.close();
    t.end();
    apm.destroy();
  });

  suite.end();
});
