/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that instrumentation using `Transaction.setDefaultName(...)` still
// works after the Lambda instrumentation has set the transaction name.

const semver = require('semver');
if (semver.satisfies(process.version, '>=10.0.0 <10.4.0')) {
  // This isn't considered an issue because AWS Lambda doesn't support a node
  // v10 runtime, and node v10 is EOL.
  console.log(
    `# SKIP async context propagation currently does not work to a Lambda handler with node ${process.version}`,
  );
  process.exit();
}

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

function loadFixture(file) {
  return require('./fixtures/' + file);
}

tape.test(
  'lambda instrumentation does not break trans.setDefaultName',
  function (suite) {
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

    const eventCases = [
      {
        name: 'TRIGGER_GENERIC',
        event: loadFixture('generic.json'),
      },
      {
        name: 'TRIGGER_API_GATEWAY',
        event: loadFixture('aws_api_http_test_data.json'),
      },
      {
        name: 'TRIGGER_SNS',
        event: loadFixture('aws_sns_test_data.json'),
      },
      {
        name: 'TRIGGER_SQS',
        event: loadFixture('aws_sqs_test_data.json'),
      },
      {
        name: 'TRIGGER_S3_SINGLE_EVENT',
        event: loadFixture('aws_s3_test_data.json'),
      },
    ];
    eventCases.forEach((eventCase) => {
      suite.test(
        `trans.setDefaultName(...) works with ${eventCase.name} event type`,
        function (t) {
          const handler = apm.lambda((event, _context, cb) => {
            // Simulate some other instrumentation using `Transaction.setDefaultName(...)`.
            // For example the graphql instrumentation will do this to set the
            // transaction name. This should *work*.
            apm.currentTransaction.setDefaultName(
              'setting this trans name should work',
            );

            cb(null, 'hi');
          });

          server.clear();
          lambdaLocal.execute({
            event: eventCase.event,
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
              const trans = server.events[1].transaction;
              t.equal(trans.name, 'setting this trans name should work');
              t.end();
            },
          });
        },
      );
    });

    suite.test('teardown', function (t) {
      server.close();
      t.end();
      apm.destroy();
    });

    suite.end();
  },
);
