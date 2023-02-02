/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test "transaction" objects created for Lambda instrumentation.
//
// (This is similar to "transaction.test.js", but uses the real Agent, not the
// "AgentMock". The mock doesn't fully test the "transaction" intake event
// object creation path.)

const lambdaLocal = require('lambda-local')
const tape = require('tape')

const apm = require('../../')
const { MockAPMServer } = require('../_mock_apm_server')

// Setup env for both apm.start() and lambdaLocal.execute().
process.env.AWS_LAMBDA_FUNCTION_NAME = 'fixture-function-name'
// Set these values to have stable data from lambdaLocal.execute().
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCOUNT_ID = '123456789012'
// A lambda-local limitation is that it doesn't set AWS_LAMBDA_LOG_GROUP_NAME
// and AWS_LAMBDA_LOG_STREAM_NAME (per
// https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html).
process.env.AWS_LAMBDA_LOG_GROUP_NAME = `/aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME}`
process.env.AWS_LAMBDA_LOG_STREAM_NAME = '2021/11/01/[1.0]lambda/e7b05091b39b4aa2aef19efe4d262e79'
// Avoid the lambda-local loading AWS credentials and session info from
// a configured real AWS profile and possibly emitting this warning:
//    warning Using both auth systems: aws_access_key/id and secret_access_token!
process.env.AWS_PROFILE = 'fake'

function loadFixture (file) {
  return require('./fixtures/' + file)
}

tape.test('lambda transactions', function (suite) {
  let server
  let serverUrl

  suite.test('setup', function (t) {
    server = new MockAPMServer()
    server.start(function (serverUrl_) {
      serverUrl = serverUrl_
      t.comment('mock APM serverUrl: ' + serverUrl)
      apm.start({
        serverUrl,
        logLevel: 'off',
        captureExceptions: false,
        captureBody: 'all'
      })
      t.comment('APM agent started')
      t.end()
    })
  })

  const testCases = [
    {
      name: 'transaction.context.{request,response} for API Gateway payload format version 1.0',
      event: loadFixture('aws_api_rest_test_data.json'),
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        t.deepEqual(trans.context.request, {
          http_version: '1.1',
          method: 'GET',
          url: {
            raw: '/dev/fetch_all?q=myquery',
            protocol: 'https:',
            hostname: '02plqthge2.execute-api.us-east-1.amazonaws.com',
            port: '443',
            pathname: '/dev/fetch_all',
            search: '?q=myquery',
            full: 'https://02plqthge2.execute-api.us-east-1.amazonaws.com:443/dev/fetch_all?q=myquery'
          },
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:72.0) Gecko/20100101 Firefox/72.0',
            via: '2.0 969f35f01b6eddd92239a3e818fc1e0d.cloudfront.net (CloudFront)',
            'x-amz-cf-id': 'eDbpfDwO-CRYymEFLkW6CBCsU_H_PS8R93_us53QWvXWLS45v3NvQw==',
            'x-amzn-trace-id': 'Root=1-5e502af4-fd0c1c6fdc164e1d6361183b',
            'x-forwarded-for': '76.76.241.57, 52.46.47.139',
            'x-forwarded-port': '443',
            'x-forwarded-proto': 'https'
          },
          socket: { remote_address: '76.76.241.57' }
        }, 'transaction.context.request')
        t.deepEqual(trans.context.response, {
          status_code: 202,
          headers: { Foo: 'bar' }
        }, 'transaction.context.response')
      }
    },
    {
      name: 'transaction.context.{request,response} for API Gateway payload format version 2.0',
      event: loadFixture('aws_api_http_test_data.json'),
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        t.deepEqual(trans.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: {
            raw: '/default/the-function-name?q=foo',
            protocol: 'https:',
            hostname: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
            port: '443',
            pathname: '/default/the-function-name',
            search: '?q=foo',
            full: 'https://21mj4tsk90.execute-api.us-west-2.amazonaws.com:443/default/the-function-name?q=foo'
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
            'x-forwarded-proto': 'https'
          },
          socket: { remote_address: '67.171.184.49' },
          body: '{"foo":"bar"}'
        }, 'transaction.context.request')
        t.deepEqual(trans.context.response, {
          status_code: 202,
          headers: { Foo: 'bar' }
        }, 'transaction.context.response')
      }
    },
    {
      name: 'transaction.context.response for API Gateway payload format version 2.0 with inferred response data',
      event: loadFixture('aws_api_http_test_data.json'),
      handler: (_event, _context, cb) => {
        cb(null, 'hi')
      },
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        t.deepEqual(trans.context.response, {
          status_code: 200,
          headers: { 'content-type': 'application/json' }
        }, 'transaction.context.response')
      }
    },
    {
      name: 'API Gateway event, handler returns error, captured error should have HTTP context',
      event: loadFixture('aws_api_http_test_data.json'),
      handler: (_event, _context, cb) => {
        cb(new Error('boom'))
      },
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        const error = events[2].error
        t.equal(trans.outcome, 'failure', 'transaction.outcome')
        t.equal(error.transaction_id, trans.id, 'error.transaction_id')
        t.ok(error.context.request, 'has error.context.request')
        t.equal(error.context.response.status_code, 500, 'error.context.response.status_code')
      }
    },
    {
      name: 'ALB (ELB) event',
      event: loadFixture('aws_elb_test_data.json'),
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        t.equal(trans.trace_id, '12345678901234567890123456789012', 'transaction.trace_id')
        t.equal(trans.parent_id, '1234567890123456', 'transaction.parent_id')
        t.equal(trans.type, 'request', 'transaction.type')
        t.equal(trans.name, 'POST unknown route', 'transaction.name')
        t.equal(trans.result, 'HTTP 2xx', 'transaction.result')
        t.equal(trans.outcome, 'success', 'transaction.outcome')
        t.equal(trans.faas.trigger.type, 'http', 'transaction.faas.trigger.type')
        t.equal(trans.faas.trigger.request_id, undefined, 'no transaction.faas.trigger.request_id for ELB')
        t.equal(trans.context.service.origin.name, 'my-target-group-1', 'transaction.context.service.origin.name')
        t.equal(trans.context.service.origin.id, 'arn:aws:elasticloadbalancing:us-west-2:919493274929:targetgroup/my-target-group-1/e88598a9d8909e9f', 'transaction.context.service.origin.id')
        t.equal(trans.context.cloud.origin.service.name, 'elb', 'transaction.context.cloud.origin.service.name')
        t.equal(trans.context.cloud.origin.account.id, '919493274929', 'transaction.context.cloud.origin.account.id')
        t.equal(trans.context.cloud.origin.region, 'us-west-2', 'transaction.context.cloud.origin.region')
        t.equal(trans.context.cloud.origin.provider, 'aws', 'transaction.context.cloud.origin.provider')
        t.equal(trans.context.request.method, 'POST', 'transaction.context.request.method')
        t.equal(trans.context.request.url.full, 'http://my-alb-598237592.us-west-2.elb.amazonaws.com:80/foo/', 'transaction.context.request.url.full')
        // This shows (a) base64-decoding of the body and (b) redaction of the
        // form field matching '*token*' in `sanitizeFieldNames`.
        t.equal(trans.context.request.body, 'ham=eggs&myToken=%5BREDACTED%5D', 'transaction.context.request.body')
        t.deepEqual(trans.context.response, { status_code: 202, headers: { Foo: 'bar' } }, 'transaction.context.response')
      }
    },
    {
      // ELB defaults to 502 Bad Gateway if the response doesn't have "statusCode".
      name: 'ALB (ELB) event with missing "statusCode" field',
      event: loadFixture('aws_elb_test_data.json'),
      handler: async (_event, _context, cb) => {
        return {
          // Missing 'statusCode' field that ELB expects.
          hi: 'there'
        }
      },
      checkApmEvents: (t, events) => {
        const trans = events[1].transaction
        t.equal(trans.name, 'POST unknown route', 'transaction.name')
        t.equal(trans.result, 'HTTP 5xx', 'transaction.result')
        t.equal(trans.outcome, 'failure', 'transaction.outcome')
        t.equal(trans.context.request.method, 'POST', 'transaction.context.request.method')
        t.deepEqual(trans.context.response, { status_code: 502, headers: {} }, 'transaction.context.response')
      }
    }
  ]
  testCases.forEach(c => {
    suite.test(c.name, { skip: c.skip || false }, function (t) {
      const handler = c.handler || (
        (_event, _context, cb) => {
          cb(null, {
            statusCode: 202,
            headers: {
              Foo: 'bar'
            },
            body: 'hi'
          })
        }
      )
      const wrappedHandler = apm.lambda(handler)

      server.clear()
      lambdaLocal.execute({
        event: c.event,
        lambdaFunc: {
          [process.env.AWS_LAMBDA_FUNCTION_NAME]: wrappedHandler
        },
        lambdaHandler: process.env.AWS_LAMBDA_FUNCTION_NAME,
        timeoutMs: 3000,
        verboseLevel: 0,
        callback: function (_err, _result) {
          c.checkApmEvents(t, server.events)
          t.end()
        }
      })
    })
  })

  suite.test('teardown', function (t) {
    server.close()
    t.end()
    apm.destroy()
  })

  suite.end()
})
