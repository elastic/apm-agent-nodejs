/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test trace-context propagation in Lambda instrumentation.

const test = require('tape')
const lambdaLocal = require('lambda-local')

const { elasticApmAwsLambda } = require('../../lib/lambda')
const AgentMock = require('./mock/agent')
const util = require('./_util')
const assertTransaction = util.assertTransaction

process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x'
process.env.AWS_REGION = 'us-east-1'

test('API Gateway trigger: traceparent header present', function (t) {
  const handlerName = 'greet.hello'
  const mockApiGatewayEventWithTraceContext = {
    requestContext: {
      routeKey: 'ANY /the-function-name',
      requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
      stage: 'default',
      http: {
        method: 'GET',
        path: '/default/the-function-name'
      }
    },
    headers: {
      traceparent: 'testTraceparent',
      tracestate: 'testTracestate'
    }
    // ...
  }
  const output = 'hi'

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: mockApiGatewayEventWithTraceContext,
    lambdaFunc: {
      [handlerName]: wrap((_event, _context) => {
        return Promise.resolve('hi')
      })
    },
    lambdaHandler: handlerName,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      t.strictEqual(result, output)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], 'GET /default/the-function-name')

      t.strictEqual(mockApiGatewayEventWithTraceContext.headers.traceparent,
        agent.transactions[0].opts.childOf,
        'startTransaction() childOf opt matches event.headers.traceparent')
      t.strictEqual(mockApiGatewayEventWithTraceContext.headers.tracestate,
        agent.transactions[0].opts.tracestate,
        'startTransaction() tracestate opt matches event.headers.tracestate')
      t.end()
    }
  })
})

test('API Gateway trigger: elastic-apm-traceparent present', function (t) {
  const handlerName = 'greet.hello'
  const mockApiGatewayEventWithTraceContext = {
    requestContext: {
      routeKey: 'ANY /the-function-name',
      requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
      stage: 'default',
      http: {
        method: 'GET',
        path: '/default/the-function-name'
      }
    },
    headers: {
      'elastic-apm-traceparent': 'test',
      tracestate: 'test2'
    }
    // ...
  }

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: mockApiGatewayEventWithTraceContext,
    lambdaFunc: {
      [handlerName]: wrap((_event, _context) => {
        return Promise.resolve('hi')
      })
    },
    lambdaHandler: handlerName,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      assertTransaction(t, agent.transactions[0], 'GET /default/the-function-name')
      t.strictEqual(mockApiGatewayEventWithTraceContext.headers['elastic-apm-traceparent'],
        agent.transactions[0].opts.childOf,
        'context trace id matches parent trace id')
      t.strictEqual(mockApiGatewayEventWithTraceContext.headers.tracestate,
        agent.transactions[0].opts.tracestate,
        'input tracestate pased on to transaction')
      t.end()
    }
  })
})

test('API Gateway trigger: both elastic-apm-traceparent and traceparent present', function (t) {
  const handlerName = 'greet.hello'
  const mockApiGatewayEventWithTraceContext = {
    requestContext: {
      routeKey: 'ANY /the-function-name',
      requestId: '1d108eda-bfc2-4e1a-8942-d82db026cdf9',
      stage: 'default',
      http: {
        method: 'GET',
        path: '/default/the-function-name'
      }
    },
    headers: {
      'elastic-apm-traceparent': 'prefer-w3c',
      traceparent: 'testTraceparent',
      tracestate: 'testTracestate'
    }
    // ...
  }

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: mockApiGatewayEventWithTraceContext,
    lambdaFunc: {
      [handlerName]: wrap((_event, _context) => {
        return Promise.resolve('hi')
      })
    },
    lambdaHandler: handlerName,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      assertTransaction(t, agent.transactions[0], 'GET /default/the-function-name')
      t.strictEqual(mockApiGatewayEventWithTraceContext.headers.traceparent,
        agent.transactions[0].opts.childOf,
        'startTransaction() childOf opt matches event.headers.traceparent')
      t.strictEqual(mockApiGatewayEventWithTraceContext.headers.tracestate,
        agent.transactions[0].opts.tracestate,
        'startTransaction() tracestate opt matches event.headers.tracestate')
      t.notEquals(mockApiGatewayEventWithTraceContext.headers['elastic-apm-traceparent'],
        agent.transactions[0].opts.childOf,
        'prefers traceparent to elastic-apm-traceparent')
      t.end()
    }
  })
})

test('SQS trigger: traceparent header present', function (t) {
  const handlerName = 'greet.hello'
  const mockSqsEventWithTraceContext = {
    Records: [
      {
        messageAttributes: {
          aBinaryAttr: {
            binaryValue: 'SGVsbG8sIFdvcmxkIQ==',
            stringListValues: [],
            binaryListValues: [],
            dataType: 'Binary'
          },
          traceparent: {
            stringValue: 'test-traceparent',
            stringListValues: [],
            binaryListValues: [],
            dataType: 'String'
          },
          tracestate: {
            stringValue: 'test-tracestate',
            stringListValues: [],
            binaryListValues: [],
            dataType: 'String'
          }
        },
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue'
        // ...
      },
      {
        messageAttributes: {},
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue'
        // ...
      },
      {
        messageAttributes: {
          TrAcEpArEnT: {
            stringValue: 'test-traceparent2',
            stringListValues: [],
            binaryListValues: [],
            dataType: 'String'
          }
        },
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:268121251715:testqueue'
        // ...
      }
    ]
  }
  const output = 'hi'

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: mockSqsEventWithTraceContext,
    lambdaFunc: {
      [handlerName]: wrap((_event, _context) => {
        return Promise.resolve('hi')
      })
    },
    lambdaHandler: handlerName,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      t.strictEqual(result, output)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], 'RECEIVE testqueue')
      t.deepEqual(agent.transactions[0]._links,
        [{ context: 'test-traceparent' }, { context: 'test-traceparent2' }],
        'transaction has span links for messages with a traceparent')
      t.end()
    }
  })
})

test('SNS trigger: traceparent header present', function (t) {
  const handlerName = 'greet.hello'
  const mockSnsEventWithTraceContext = {
    Records: [
      {
        EventSource: 'aws:sns',
        Sns: {
          TopicArn: 'arn:aws:sns:us-west-2:123456789012:testtopic',
          MessageAttributes: {
            aBinaryAttr: { Type: 'Binary', Value: 'SGVsbG8sIFdvcmxkIQ==' },
            traceparent: { Type: 'String', Value: 'test-traceparent' },
            tracestate: { Type: 'String', Value: 'test-tracestate' }
          }
        }
        // ...
      }
    ]
  }
  const output = 'hi'

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: mockSnsEventWithTraceContext,
    lambdaFunc: {
      [handlerName]: wrap((_event, _context) => {
        return Promise.resolve('hi')
      })
    },
    lambdaHandler: handlerName,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      t.strictEqual(result, output)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], 'RECEIVE testtopic')
      t.deepEqual(agent.transactions[0]._links, [{ context: 'test-traceparent' }],
        'transaction has a span link for the message traceparent')
      t.end()
    }
  })
})
