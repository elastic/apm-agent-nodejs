/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test "transaction" objects created for Lambda instrumentation.
//
// (This is similar to "transaction.test.js", but uses the real Agent, not the
// "AgentMock". The mock doesn't fully test the "transaction" intake event
// object creation path.)

const semver = require('semver');
if (semver.satisfies(process.version, '>=10.0.0 <10.4.0')) {
  // This isn't considered an issue because AWS Lambda doesn't support a node
  // v10 runtime, and node v10 is EOL.
  console.log(
    `# SKIP async context propagation currently does not work to a Lambda handler with node ${process.version}`,
  );
  process.exit();
}

const fs = require('fs');
const path = require('path');

const lambdaLocal = require('lambda-local');
const tape = require('tape');

// Setup env for `require('elastic-apm-http-client')` and lambdaLocal.execute().
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

const apm = require('../../');
const { MockAPMServer } = require('../_mock_apm_server');
const { findObjInArray } = require('../_utils');

const UUID_RE =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

// ---- support functions

function loadFixture(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file)));
}

// There is an expected order and set of requests from the APM agent to the
// Elastic Lambda extension in a Lambda function.
//
// - There may be a `GET /` request.
// - There must be a `POST /register/transaction` request -- at least for the
//   first invocation. If that fails, then the APM agent will stop sending this.
// - For a lambda invocation that completes (as opposed to a timeout, crash, etc.):
//    - There must be one or more `POST /intake/v2/events` req with tracing data.
//    - The last `POST /intake/v2/events` request must have the `?flushed=true`
//      query param.
function assertExpectedServerRequests(
  t,
  requests,
  expectIntakeRequests = true,
) {
  const rootReq = findObjInArray(requests, 'url', '/');
  if (rootReq) {
    t.equal(rootReq.method, 'GET', '"GET /" request');
  }

  const regReq = findObjInArray(requests, 'url', '/register/transaction');
  t.equal(regReq.method, 'POST', '"POST /register/transaction" request');
  t.equal(
    regReq.headers['content-type'],
    'application/vnd.elastic.apm.transaction+ndjson',
    '"POST /register/transaction" content-type',
  );
  t.ok(
    regReq.headers['x-elastic-aws-request-id'],
    '"POST /register/transaction" x-elastic-aws-request-id header',
  );
  t.ok(
    regReq.body.includes('{"metadata":'),
    '"POST /register/transaction" body includes metadata',
  );
  t.ok(
    regReq.body.includes('{"transaction":'),
    '"POST /register/transaction" body includes transaction',
  );

  if (expectIntakeRequests) {
    const intakeReqs = requests.filter((r) =>
      r.url.startsWith('/intake/v2/events'),
    );
    intakeReqs.forEach((intakeReq) => {
      t.equal(intakeReq.method, 'POST', '"POST /intake/v2/events" request');
    });
    t.equal(
      intakeReqs[intakeReqs.length - 1].url,
      '/intake/v2/events?flushed=true',
      'last intake request uses "?flushed=true"',
    );
  }
}

// ---- tests

tape.test('lambda transactions', function (suite) {
  let server;
  let serverUrl;

  suite.test('setup', function (t) {
    server = new MockAPMServer({ mockLambdaExtension: true });
    server.start(function (serverUrl_) {
      serverUrl = serverUrl_;
      t.comment('mock APM serverUrl: ' + serverUrl);
      apm.start({
        serverUrl,
        logLevel: 'off',
        captureExceptions: false,
        captureBody: 'all',
      });
      t.comment('APM agent started');
      t.end();
    });
  });

  let testCases = [
    // Test handling of `transaction.faas.coldstart`.
    {
      name: 'coldstart: first',
      event: {},
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        const trans = events[1].transaction;
        t.strictEqual(trans.faas.coldstart, true, 'transaction.faas.coldstart');
      },
    },
    {
      name: 'coldstart: second',
      event: {},
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        const trans = events[1].transaction;
        t.strictEqual(
          trans.faas.coldstart,
          false,
          'transaction.faas.coldstart',
        );
      },
    },

    // Test usage of the `context.{succeed,done,fail}()` methods -- now
    // deprecated by Lambda -- in the handler function.
    {
      name: 'context.succeed()',
      event: {},
      handler: (_event, context) => {
        context.succeed('hi');
      },
      checkResults: (t, requests, events, _err, result) => {
        assertExpectedServerRequests(t, requests);
        t.equal(result, 'hi', 'result');
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
      },
    },
    {
      name: 'context.done()',
      event: {},
      handler: (_event, context) => {
        context.done(null, 'hi');
      },
      checkResults: (t, requests, events, _err, result) => {
        assertExpectedServerRequests(t, requests);
        t.equal(result, 'hi', 'result');
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
      },
    },
    {
      name: 'context.fail()',
      event: {},
      handler: (_event, context) => {
        context.fail(new Error('boom'));
      },
      checkResults: (t, requests, events, err, _result) => {
        assertExpectedServerRequests(t, requests);
        t.equal(err.errorMessage, 'boom', 'err.errorMessage');
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'failure', 'transaction.outcome');
      },
    },

    // Test usage of Promises in the handler function.
    {
      name: 'Promise resolve',
      event: {},
      handler: () => {
        return Promise.resolve('hi');
      },
      checkResults: (t, requests, events, _err, result) => {
        assertExpectedServerRequests(t, requests);
        t.equal(result, 'hi', 'result');
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
      },
    },
    {
      name: 'Promise reject',
      event: {},
      handler: () => {
        return Promise.reject(new Error('boom'));
      },
      checkResults: (t, requests, events, err, _result) => {
        assertExpectedServerRequests(t, requests);
        t.equal(err.errorMessage, 'boom', 'err.errorMessage');
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'failure', 'transaction.outcome');
      },
    },

    // General transaction fields for various trigger events.
    // There are specific tests below for some of the fields.
    {
      name: 'trans data: API Gateway v1 "rest"',
      event: loadFixture('aws_api_rest_test_data.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'request', 'transaction.type');
        t.equal(trans.name, 'GET /dev/fetch_all', 'transaction.name');
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: {
              type: 'http',
              request_id: '6f3dffca-46f8-4c8b-800b-6bc1ea2554ec',
            },
          },
          'transaction.faas',
        );
        t.deepEqual(
          trans.context.service,
          {
            origin: {
              name: '02plqthge2.execute-api.us-east-1.amazonaws.com',
              id: '02plqthge2',
              version: '1.0',
            },
          },
          'transaction.context.service',
        );
        t.deepEqual(
          trans.context.cloud,
          {
            origin: {
              provider: 'aws',
              service: { name: 'api gateway' },
              account: { id: '571481734049' },
            },
          },
          'transaction.context.cloud',
        );
      },
    },
    {
      name: 'trans data: API Gateway v2 "http"',
      event: loadFixture('aws_api_http_test_data.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'request', 'transaction.type');
        t.equal(
          trans.name,
          'POST /default/the-function-name',
          'transaction.name',
        );
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: { type: 'http', request_id: 'D-TXmgKqPHcEJMg=' },
          },
          'transaction.faas',
        );
        t.deepEqual(
          trans.context.service,
          {
            origin: {
              name: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
              id: '21mj4tsk90',
              version: '2.0',
            },
          },
          'transaction.context.service',
        );
        t.deepEqual(
          trans.context.cloud,
          {
            origin: {
              provider: 'aws',
              service: { name: 'api gateway' },
              account: { id: '000000000000' },
            },
          },
          'transaction.context.cloud',
        );
      },
    },
    {
      name: 'trans data: SQS',
      event: loadFixture('aws_sqs_test_data.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'messaging', 'transaction.type');
        t.equal(trans.name, 'RECEIVE testqueue', 'transaction.name');
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: { type: 'pubsub' },
          },
          'transaction.faas',
        );
        t.deepEqual(
          trans.context.service,
          {
            origin: {
              name: 'testqueue',
              id: 'arn:aws:sqs:us-east-1:268121251715:testqueue',
            },
          },
          'transaction.context.service',
        );
        t.deepEqual(
          trans.context.cloud,
          {
            origin: {
              provider: 'aws',
              region: 'us-east-1',
              service: { name: 'sqs' },
              account: { id: '268121251715' },
            },
          },
          'transaction.context.cloud',
        );
      },
    },
    {
      name: 'trans data: SNS',
      event: loadFixture('aws_sns_test_data.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'messaging', 'transaction.type');
        t.equal(trans.name, 'RECEIVE basepiwstesttopic', 'transaction.name');
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: { type: 'pubsub' },
          },
          'transaction.faas',
        );
        t.deepEqual(
          trans.context.service,
          {
            origin: {
              name: 'basepiwstesttopic',
              id: 'arn:aws:sns:us-east-1:268121251715:basepiwstesttopic',
            },
          },
          'transaction.context.service',
        );
        t.deepEqual(
          trans.context.cloud,
          {
            origin: {
              provider: 'aws',
              region: 'us-east-1',
              service: { name: 'sns' },
              account: { id: '268121251715' },
            },
          },
          'transaction.context.cloud',
        );
      },
    },
    {
      name: 'trans data: S3 single event',
      event: loadFixture('aws_s3_test_data.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'request', 'transaction.type');
        t.equal(
          trans.name,
          'ObjectCreated:Put basepitestbucket',
          'transaction.name',
        );
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: { type: 'datasource', request_id: '0FM18R15SDX52CT2' },
          },
          'transaction.faas',
        );
        t.deepEqual(
          trans.context.service,
          {
            origin: {
              name: 'basepitestbucket',
              id: 'arn:aws:s3:::basepitestbucket',
              version: '2.1',
            },
          },
          'transaction.context.service',
        );
        t.deepEqual(
          trans.context.cloud,
          {
            origin: {
              provider: 'aws',
              service: { name: 's3' },
              region: 'us-east-1',
            },
          },
          'transaction.context.cloud',
        );
      },
    },
    {
      name: 'trans data: generic event',
      event: loadFixture('generic.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.type, 'request', 'transaction.type');
        t.equal(trans.name, 'fixture-function-name', 'transaction.name');
        t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution');
        t.deepEqual(
          trans.faas,
          {
            id: 'arn:aws:lambda:us-east-1:123456789012:function:fixture-function-name',
            name: 'fixture-function-name',
            version: '1.0',
            coldstart: trans.faas.coldstart,
            execution: trans.faas.execution,
            trigger: { type: 'other' },
          },
          'transaction.faas',
        );
        t.deepEqual(trans.context.service, {}, 'transaction.context.service');
        t.deepEqual(
          trans.context.cloud,
          { origin: { provider: 'aws' } },
          'transaction.context.cloud',
        );
      },
    },

    // API Gateway triggers with/without usePathAsTransactionName.
    {
      name: 'usePathAsTransactionName=false',
      conf: {
        usePathAsTransactionName: false,
      },
      event: loadFixture('aws_apigateway_event_with_template_path.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.name, 'POST /prod/{proxy+}', 'transaction.name');
      },
    },
    {
      name: 'usePathAsTransactionName=true',
      conf: {
        usePathAsTransactionName: true,
      },
      event: loadFixture('aws_apigateway_event_with_template_path.json'),
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.name, 'POST /prod/path/to/resource', 'transaction.name');
      },
    },

    // Invalid event objects do not result in a crash in instrumentation.
    {
      name: 'invalid event: empty API Gateway event',
      event: {
        requestContext: {
          requestId: 'abc123',
        },
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, result) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
        t.error(err, 'no err');
        t.equal(result, 'hi');
      },
    },
    {
      name: 'invalid event: empty SQS event',
      event: {
        Records: [
          {
            eventSource: 'aws:sqs',
          },
        ],
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, result) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
        t.error(err, 'no err');
        t.equal(result, 'hi');
      },
    },
    {
      name: 'invalid event: empty SNS event',
      event: {
        Records: [
          {
            EventSource: 'aws:sns',
          },
        ],
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, result) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
        t.error(err, 'no err');
        t.equal(result, 'hi');
      },
    },
    {
      name: 'invalid event: empty S3 event',
      event: {
        Records: [
          {
            eventSource: 'aws:s3',
          },
        ],
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, result) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.outcome, 'success', 'transaction.outcome');
        t.error(err, 'no err');
        t.equal(result, 'hi');
      },
    },

    // Test trace-context handling (i.e. traceparent and tracestate from
    // the trigger event).
    {
      name: 'trace-context: API Gateway: traceparent header present',
      event: {
        requestContext: {
          domainName: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
          domainPrefix: '21mj4tsk90',
          routeKey: 'ANY /the-function-name',
          requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
          stage: 'default',
          http: { method: 'GET', path: '/default/the-function-name' },
        },
        headers: {
          traceparent:
            '00-12345678901234567890123456789012-1234567890123456-01',
          tracestate: 'acme:foo=123',
        },
        // ...
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, _result) => {
        assertExpectedServerRequests(t, requests);
        t.error(err, 'no err');
        const trans = events[1].transaction;
        t.equal(
          trans.name,
          'GET /default/the-function-name',
          'transaction.name',
        );
        t.equal(
          trans.trace_id,
          '12345678901234567890123456789012',
          'transaction.trace_id',
        );
        t.equal(trans.parent_id, '1234567890123456', 'transaction.parent_id');
        // No great way to test that `tracestate` was picked up.
      },
    },
    {
      name: 'trace-context: API Gateway: elastic-apm-traceparent header present',
      event: {
        requestContext: {
          domainName: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
          domainPrefix: '21mj4tsk90',
          routeKey: 'ANY /the-function-name',
          requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
          stage: 'default',
          http: { method: 'GET', path: '/default/the-function-name' },
        },
        headers: {
          'elastic-apm-traceparent':
            '00-abc45678901234567890123456789012-abc4567890123456-01',
          tracestate: 'acme:foo=123',
        },
        // ...
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, _result) => {
        assertExpectedServerRequests(t, requests);
        t.error(err, 'no err');
        const trans = events[1].transaction;
        t.equal(
          trans.name,
          'GET /default/the-function-name',
          'transaction.name',
        );
        t.equal(
          trans.trace_id,
          'abc45678901234567890123456789012',
          'transaction.trace_id',
        );
        t.equal(trans.parent_id, 'abc4567890123456', 'transaction.parent_id');
      },
    },
    {
      name: 'trace-context: API Gateway: both traceparent and elastic-apm-traceparent present',
      event: {
        requestContext: {
          domainName: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
          domainPrefix: '21mj4tsk90',
          routeKey: 'ANY /the-function-name',
          requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
          stage: 'default',
          http: { method: 'GET', path: '/default/the-function-name' },
        },
        headers: {
          'elastic-apm-traceparent':
            '00-abc45678901234567890123456789012-abc4567890123456-01',
          traceparent:
            '00-12345678901234567890123456789012-1234567890123456-01',
          tracestate: 'acme:foo=123',
        },
        // ...
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, _result) => {
        assertExpectedServerRequests(t, requests);
        t.error(err, 'no err');
        const trans = events[1].transaction;
        t.equal(
          trans.name,
          'GET /default/the-function-name',
          'transaction.name',
        );
        t.equal(
          trans.trace_id,
          '12345678901234567890123456789012',
          'transaction.trace_id',
        );
        t.equal(trans.parent_id, '1234567890123456', 'transaction.parent_id');
      },
    },
    {
      name: 'trace-context: SQS: traceparent present',
      event: {
        Records: [
          {
            messageAttributes: {
              aBinaryAttr: {
                binaryValue: 'SGVsbG8sIFdvcmxkIQ==',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'Binary',
              },
              traceparent: {
                stringValue:
                  '00-12345678901234567890123456789012-1234567890123456-01',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'String',
              },
              tracestate: {
                stringValue: 'acme:foo=123',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'String',
              },
            },
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue',
            // ...
          },
          {
            messageAttributes: {},
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue',
            // ...
          },
          {
            messageAttributes: {
              TrAcEpArEnT: {
                stringValue:
                  '00-abc45678901234567890123456789012-abc4567890123456-01',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'String',
              },
            },
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue',
            // ...
          },
        ],
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, _result, c) => {
        assertExpectedServerRequests(t, requests);
        t.error(err, 'no err');
        const trans = events[1].transaction;
        t.equal(trans.name, 'RECEIVE testqueue', 'transaction.name');
        t.deepEqual(
          trans.links,
          [
            {
              trace_id: '12345678901234567890123456789012',
              span_id: '1234567890123456',
            },
            {
              trace_id: 'abc45678901234567890123456789012',
              span_id: 'abc4567890123456',
            },
          ],
          'transaction.links',
        );
      },
    },
    {
      name: 'trace-context: SNS: traceparent present',
      event: {
        Records: [
          {
            EventSource: 'aws:sns',
            Sns: {
              TopicArn: 'arn:aws:sns:us-west-2:123456789012:testtopic',
              MessageAttributes: {
                aBinaryAttr: { Type: 'Binary', Value: 'SGVsbG8sIFdvcmxkIQ==' },
                traceparent: {
                  Type: 'String',
                  Value:
                    '00-12345678901234567890123456789012-1234567890123456-01',
                },
                tracestate: { Type: 'String', Value: 'acme:foo=123' },
              },
            },
            // ...
          },
        ],
      },
      handler: async () => {
        return 'hi';
      },
      checkResults: (t, requests, events, err, _result, c) => {
        assertExpectedServerRequests(t, requests);
        t.error(err, 'no err');
        const trans = events[1].transaction;
        t.equal(trans.name, 'RECEIVE testtopic', 'transaction.name');
        t.deepEqual(
          trans.links,
          [
            {
              trace_id: '12345678901234567890123456789012',
              span_id: '1234567890123456',
            },
          ],
          'transaction.links',
        );
      },
    },

    {
      name: 'transaction.context.{request,response} for API Gateway payload format version 1.0',
      event: loadFixture('aws_api_rest_test_data.json'),
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.deepEqual(
          trans.context.request,
          {
            http_version: '1.1',
            method: 'GET',
            url: {
              raw: '/dev/fetch_all?q=myquery',
              protocol: 'https:',
              hostname: '02plqthge2.execute-api.us-east-1.amazonaws.com',
              port: '443',
              pathname: '/dev/fetch_all',
              search: '?q=myquery',
              full: 'https://02plqthge2.execute-api.us-east-1.amazonaws.com:443/dev/fetch_all?q=myquery',
            },
            headers: {
              accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'accept-encoding': 'gzip, deflate, br',
              'accept-language': 'en-US,en;q=0.5',
              'cloudfront-forwarded-proto': 'https',
              'cloudfront-is-desktop-viewer': 'true',
              'cloudfront-is-mobile-viewer': 'false',
              'cloudfront-is-smarttv-viewer': 'false',
              'cloudfront-is-tablet-viewer': 'false',
              'cloudfront-viewer-country': 'US',
              host: '02plqthge2.execute-api.us-east-1.amazonaws.com',
              'upgrade-insecure-requests': '1',
              'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:72.0) Gecko/20100101 Firefox/72.0',
              via: '2.0 969f35f01b6eddd92239a3e818fc1e0d.cloudfront.net (CloudFront)',
              'x-amz-cf-id':
                'eDbpfDwO-CRYymEFLkW6CBCsU_H_PS8R93_us53QWvXWLS45v3NvQw==',
              'x-amzn-trace-id': 'Root=1-5e502af4-fd0c1c6fdc164e1d6361183b',
              'x-forwarded-for': '76.76.241.57, 52.46.47.139',
              'x-forwarded-port': '443',
              'x-forwarded-proto': 'https',
            },
            socket: { remote_address: '76.76.241.57' },
          },
          'transaction.context.request',
        );
        t.deepEqual(
          trans.context.response,
          {
            status_code: 202,
            headers: { Foo: 'bar' },
          },
          'transaction.context.response',
        );
      },
    },
    {
      name: 'transaction.context.{request,response} for API Gateway payload format version 2.0',
      event: loadFixture('aws_api_http_test_data.json'),
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.deepEqual(
          trans.context.request,
          {
            http_version: '1.1',
            method: 'POST',
            url: {
              raw: '/default/the-function-name?q=foo',
              protocol: 'https:',
              hostname: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
              port: '443',
              pathname: '/default/the-function-name',
              search: '?q=foo',
              full: 'https://21mj4tsk90.execute-api.us-west-2.amazonaws.com:443/default/the-function-name?q=foo',
            },
            headers: {
              accept: '*/*',
              'content-length': '13',
              'content-type': 'application/json',
              host: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
              'user-agent': 'curl/7.64.1',
              'x-amzn-trace-id': 'Root=1-611598fd-16b2bd060ca70cab7eb87c47',
              'x-forwarded-for': '67.171.184.49',
              'x-forwarded-port': '443',
              'x-forwarded-proto': 'https',
            },
            socket: { remote_address: '67.171.184.49' },
            body: '{"foo":"bar"}',
          },
          'transaction.context.request',
        );
        t.deepEqual(
          trans.context.response,
          {
            status_code: 202,
            headers: { Foo: 'bar' },
          },
          'transaction.context.response',
        );
      },
    },
    {
      name: 'transaction.context.response for API Gateway payload format version 2.0 with inferred response data',
      event: loadFixture('aws_api_http_test_data.json'),
      handler: (_event, _context, cb) => {
        cb(null, 'hi');
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.deepEqual(
          trans.context.response,
          {
            status_code: 200,
            headers: { 'content-type': 'application/json' },
          },
          'transaction.context.response',
        );
      },
    },
    {
      name: 'API Gateway event, handler returns error, captured error should have HTTP context',
      event: loadFixture('aws_api_http_test_data.json'),
      handler: (_event, _context, cb) => {
        cb(new Error('boom'));
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        const error = events[2].error;
        t.equal(trans.outcome, 'failure', 'transaction.outcome');
        t.equal(trans.result, 'HTTP 5xx', 'transaction.result');
        t.equal(error.transaction_id, trans.id, 'error.transaction_id');
        t.ok(error.context.request, 'has error.context.request');
        t.equal(
          error.context.response.status_code,
          500,
          'error.context.response.status_code',
        );
      },
    },
    {
      name: 'ALB (ELB) event',
      event: loadFixture('aws_elb_test_data.json'),
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(
          trans.trace_id,
          '12345678901234567890123456789012',
          'transaction.trace_id',
        );
        t.equal(trans.parent_id, '1234567890123456', 'transaction.parent_id');
        t.equal(trans.type, 'request', 'transaction.type');
        t.equal(trans.name, 'POST unknown route', 'transaction.name');
        t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
        t.equal(trans.outcome, 'success', 'transaction.outcome');
        t.equal(
          trans.faas.trigger.type,
          'http',
          'transaction.faas.trigger.type',
        );
        t.equal(
          trans.faas.trigger.request_id,
          undefined,
          'no transaction.faas.trigger.request_id for ELB',
        );
        t.equal(
          trans.context.service.origin.name,
          'my-target-group-1',
          'transaction.context.service.origin.name',
        );
        t.equal(
          trans.context.service.origin.id,
          'arn:aws:elasticloadbalancing:us-west-2:919493274929:targetgroup/my-target-group-1/e88598a9d8909e9f',
          'transaction.context.service.origin.id',
        );
        t.equal(
          trans.context.cloud.origin.service.name,
          'elb',
          'transaction.context.cloud.origin.service.name',
        );
        t.equal(
          trans.context.cloud.origin.account.id,
          '919493274929',
          'transaction.context.cloud.origin.account.id',
        );
        t.equal(
          trans.context.cloud.origin.region,
          'us-west-2',
          'transaction.context.cloud.origin.region',
        );
        t.equal(
          trans.context.cloud.origin.provider,
          'aws',
          'transaction.context.cloud.origin.provider',
        );
        t.equal(
          trans.context.request.method,
          'POST',
          'transaction.context.request.method',
        );
        t.equal(
          trans.context.request.url.full,
          'http://my-alb-598237592.us-west-2.elb.amazonaws.com:80/foo/',
          'transaction.context.request.url.full',
        );
        // This shows (a) base64-decoding of the body and (b) redaction of the
        // form field matching '*token*' in `sanitizeFieldNames`.
        t.equal(
          trans.context.request.body,
          'ham=eggs&myToken=%5BREDACTED%5D',
          'transaction.context.request.body',
        );
        t.deepEqual(
          trans.context.response,
          { status_code: 202, headers: { Foo: 'bar' } },
          'transaction.context.response',
        );
      },
    },
    {
      // ELB defaults to 502 Bad Gateway if the response doesn't have "statusCode".
      name: 'ALB (ELB) event with missing "statusCode" field',
      event: loadFixture('aws_elb_test_data.json'),
      handler: async (_event, _context) => {
        return {
          // Missing 'statusCode' field that ELB expects.
          hi: 'there',
        };
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.name, 'POST unknown route', 'transaction.name');
        t.equal(trans.result, 'HTTP 5xx', 'transaction.result');
        t.equal(trans.outcome, 'failure', 'transaction.outcome');
        t.equal(
          trans.context.request.method,
          'POST',
          'transaction.context.request.method',
        );
        t.deepEqual(
          trans.context.response,
          { status_code: 502, headers: {} },
          'transaction.context.response',
        );
      },
    },
    {
      name: 'API Gateway event, but without ".headers" field: APM agent should not crash',
      event: (function () {
        const ev = loadFixture('aws_api_http_test_data.json');
        delete ev.headers;
        return ev;
      })(),
      handler: (_event, _context, cb) => {
        cb(null, { statusCode: 200, body: 'hi' });
      },
      checkResults: (t, requests, events) => {
        const trans = events[1].transaction;
        t.equal(
          trans.name,
          'POST /default/the-function-name',
          'transaction.name',
        );
        t.equal(trans.outcome, 'success', 'transaction.outcome');
      },
    },
    {
      name: 'ELB event, but without ".headers" field: APM agent should not crash',
      event: (function () {
        const ev = loadFixture('aws_elb_test_data.json');
        delete ev.headers;
        return ev;
      })(),
      handler: (_event, _context, cb) => {
        cb(null, { statusCode: 200, body: 'hi' });
      },
      checkResults: (t, requests, events) => {
        const trans = events[1].transaction;
        t.equal(
          trans.faas.name,
          'fixture-function-name',
          'transaction.faas.name',
        );
        t.equal(trans.outcome, 'success', 'transaction.outcome');
      },
    },
    {
      // Test that a `POST /register/transaction` request from the APM agent
      // will result in this transaction getting reported -- assuming the
      // Lambda extension does its job.
      name: 'lambda fn timeout',
      event: {},
      timeoutMs: 500,
      handler: (_event, _context, cb) => {
        setTimeout(() => {
          cb(null, 'hi');
        }, 1000);
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(
          t,
          requests,
          /* expectIntakeRequests */ false,
        );
        t.equal(events.length, 0, 'no intake events were reported');
        // Get the transaction from the `POST /register/transaction` request
        // and assert some basic structure.
        const regReq = findObjInArray(requests, 'url', '/register/transaction');
        const trans = JSON.parse(regReq.body.split(/\n/g)[1]).transaction;
        t.equal(
          trans.faas.name,
          process.env.AWS_LAMBDA_FUNCTION_NAME,
          'transaction.faas.name',
        );
        t.equal(trans.outcome, 'unknown', 'transaction.outcome');
      },
    },
    {
      name: 'lambda fn sync throw',
      event: {},
      handler: (_event, _context, cb) => {
        throw new Error('errorThrowSync');
      },
      checkResults: (t, requests, events) => {
        assertExpectedServerRequests(t, requests);
        const trans = events[1].transaction;
        t.equal(trans.result, 'failure', 'transaction.result');
        t.equal(trans.outcome, 'failure', 'transaction.outcome');
        const error = events[2].error;
        t.ok(error, 'error is reported');
        t.equal(
          error.parent_id,
          trans.id,
          'error is a child of the transaction',
        );
        t.equal(
          error.exception.message,
          'errorThrowSync',
          'error.exception.message',
        );
      },
    },
  ];
  if (process.env.DEV_TEST_FILTER) {
    suite.comment(
      `Filtering "testCases" with DEV_TEST_FILTER=${process.env.DEV_TEST_FILTER}`,
    );
    testCases = testCases.filter(
      (c) => ~c.name.indexOf(process.env.DEV_TEST_FILTER),
    );
  }

  testCases.forEach((c) => {
    suite.test(c.name, { skip: c.skip || false }, function (t) {
      const handler =
        c.handler ||
        ((_event, _context, cb) => {
          cb(null, {
            statusCode: 202,
            headers: {
              Foo: 'bar',
            },
            body: 'hi',
          });
        });
      const wrappedHandler = apm.lambda(handler);

      // Save current and apply new config values.
      var confToRestore = {};
      if (c.conf) {
        Object.keys(c.conf).forEach((k) => {
          confToRestore[k] = apm._conf[k];
          apm._conf[k] = c.conf[k];
        });
      }

      server.clear();
      lambdaLocal.execute({
        event: c.event,
        lambdaFunc: {
          [process.env.AWS_LAMBDA_FUNCTION_NAME]: wrappedHandler,
        },
        lambdaHandler: process.env.AWS_LAMBDA_FUNCTION_NAME,
        timeoutMs: c.timeoutMs || 3000,
        verboseLevel: 0,
        callback: function (err, result) {
          c.checkResults(t, server.requests, server.events, err, result);

          // Restore old config values.
          Object.keys(confToRestore).forEach((k) => {
            apm._conf[k] = confToRestore[k];
          });

          t.end();
        },
      });
    });
  });

  suite.test('teardown', function (t) {
    server.close();
    t.end();
    apm.destroy();
  });

  suite.end();
});
