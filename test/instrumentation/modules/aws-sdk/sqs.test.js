/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  cloudProvider: 'none',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const tape = require('tape')
const AWS = require('aws-sdk')
const express = require('express')
const bodyParser = require('body-parser')
const fixtures = require('./fixtures/sqs')
const logging = require('../../../../lib/logging')
const mockClient = require('../../../_mock_http_client')

const {
  getToFromFromOperation,
  getActionFromRequest,
  getQueueNameFromRequest,
  getRegionFromRequest,
  getMessageDestinationContextFromRequest,
  shouldIgnoreRequest
} =
  require('../../../../lib/instrumentation/modules/aws-sdk/sqs')

initializeAwsSdk()

tape.test('AWS SQS: Unit Test Functions', function (test) {
  test.test('function getToFromFromOperation', function (t) {
    t.equals(getToFromFromOperation('deleteMessage'), 'from')
    t.equals(getToFromFromOperation('deleteMessageBatch'), 'from')
    t.equals(getToFromFromOperation('receiveMessage'), 'from')
    t.equals(getToFromFromOperation('sendMessageBatch'), 'to')
    t.equals(getToFromFromOperation('sendMessage'), 'to')
    t.end()
  })

  test.test('function getActionFromOperation', function (t) {
    const request = {}

    request.operation = 'deleteMessage'
    t.equals(getActionFromRequest(request), 'delete')

    request.operation = 'deleteMessageBatch'
    t.equals(getActionFromRequest(request), 'delete_batch')

    request.operation = 'receiveMessage'
    t.equals(getActionFromRequest(request), 'poll')

    request.operation = 'sendMessage'
    t.equals(getActionFromRequest(request), 'send')

    request.operation = 'sendMessageBatch'
    t.equals(getActionFromRequest(request), 'send_batch')

    request.operation = 'sendMessageBatch'
    request.params = null
    t.equals(getActionFromRequest(request), 'send_batch')

    request.operation = 'sendMessageBatch'
    request.params = {}
    t.equals(getActionFromRequest(request), 'send_batch')

    request.operation = 'receiveMessage'
    request.params = {}
    t.equals(getActionFromRequest(request), 'poll')

    request.operation = 'receiveMessage'
    request.params = { WaitTimeSeconds: 0 }
    t.equals(getActionFromRequest(request), 'poll')

    request.operation = 'receiveMessage'
    request.params = { WaitTimeSeconds: -1 }
    t.equals(getActionFromRequest(request), 'poll')

    request.operation = 'receiveMessage'
    request.params = { WaitTimeSeconds: 1 }
    t.equals(getActionFromRequest(request), 'poll')
    t.end()
  })

  test.test('function getQueueNameFromRequest', function (t) {
    const request = {}
    t.equals(getQueueNameFromRequest(null), 'unknown')
    t.equals(getQueueNameFromRequest(request), 'unknown')

    request.params = null
    t.equals(getQueueNameFromRequest(request), 'unknown')
    request.params = {}
    t.equals(getQueueNameFromRequest(request), 'unknown')

    request.params.QueueUrl = null
    t.equals(getQueueNameFromRequest(request), 'unknown')
    request.params.QueueUrl = 5
    t.equals(getQueueNameFromRequest(request), 'unknown')
    request.params.QueueUrl = 'foo/baz/bar'
    t.equals(getQueueNameFromRequest(request), 'unknown')

    request.params.QueueUrl = 'http://foo/baz/bar'
    t.equals(getQueueNameFromRequest(request), 'bar')

    request.params.QueueUrl = 'http://foo/baz/bar/bing?some=params&ok=true'
    t.equals(getQueueNameFromRequest(request), 'bing')
    t.end()
  })

  test.test('function getRegionFromRequest', function (t) {
    const request = {}
    t.equals(getRegionFromRequest(null), '')
    t.equals(getRegionFromRequest(request), '')

    request.service = null
    t.equals(getRegionFromRequest(request), '')
    request.service = {}
    t.equals(getRegionFromRequest(request), '')

    request.service.config = null
    t.equals(getRegionFromRequest(request), '')
    request.service.config = {}
    t.equals(getRegionFromRequest(request), '')

    request.service.config.region = null
    t.equals(getRegionFromRequest(request), '')
    request.service.config.region = 'region-name'
    t.equals(getRegionFromRequest(request), 'region-name')

    t.end()
  })

  test.test('function shouldIgnoreRequest', function (t) {
    t.equals(shouldIgnoreRequest(null, null), true)

    const request = {
      operation: 'deleteMessage',
      params: {
        QueueUrl: 'http://foo/baz/bar/bing?some=params&ok=true'
      }
    }
    const agent = {
      _conf: {
        ignoreMessageQueuesRegExp: []
      },
      logger: logging.createLogger('off')
    }

    t.equals(shouldIgnoreRequest(request, agent), false)

    agent._conf.ignoreMessageQueuesRegExp.push(/b.*g/)
    t.equals(shouldIgnoreRequest(request, agent), true)

    agent.operation = 'fakeMethod'
    t.equals(shouldIgnoreRequest(request, agent), true)

    t.end()
  })

  test.test('function getMessageDestinationContext', function (t) {
    const request = {
      service: {
        config: {
          region: 'region-name'
        },
        endpoint: {
          hostname: 'example.com',
          port: 1234
        }
      },
      params: {
        QueueUrl: 'http://foo/baz/bar/bing?some=params&ok=true'
      }
    }

    t.equals(getRegionFromRequest(request), 'region-name')
    t.equals(getQueueNameFromRequest(request), 'bing')

    t.deepEquals(getMessageDestinationContextFromRequest(request), {
      address: 'example.com',
      port: 1234,
      cloud: {
        region: 'region-name'
      }
    })
    t.end()
  })

  test.end()
})

tape.test('AWS SQS: End to End Tests', function (test) {
  test.test('API: sendMessage', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]
        t.equals(spanSqs.name, 'SQS SEND to our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'send', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        // Ensure the request sent to SQS included trace-context in message
        // attributes.  The mock server parses the sent urlencoded body into an
        // object on req.body.
        t.equal(app._receivedReqs.length, 1)
        const req = app._receivedReqs[0]
        t.equal(req.body.Action, 'SendMessage', 'req.body.Action')
        // The fixture has 3 message attributes, so traceparent and tracestate
        // should be attributes 4 and 5.
        t.equal(req.body['MessageAttribute.4.Name'], 'traceparent', 'traceparent message attribute Name')
        t.equal(req.body['MessageAttribute.4.Value.DataType'], 'String', 'traceparent message attribute DataType')
        t.equal(req.body['MessageAttribute.4.Value.StringValue'], `00-${spanSqs.trace_id}-${spanSqs.id}-01`, 'traceparent message attribute StringValue')
        t.equal(req.body['MessageAttribute.5.Name'], 'tracestate', 'tracestate message attribute Name')
        t.equal(req.body['MessageAttribute.5.Value.DataType'], 'String', 'tracestate message attribute DataType')
        t.equal(req.body['MessageAttribute.5.Value.StringValue'], 'es=s:1', 'tracestate message attribute StringValue')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessage', listener.address().port)
      sqs.sendMessage(params, function (err, data) {
        t.error(err)
        t.ok(agent.currentSpan === null, 'no currentSpan in sqs.sendMessage callback')
        agent.endTransaction()
        listener.close()
      })
      t.ok(agent.currentSpan === null, 'no currentSpan in sync code after sqs.sendMessage')
    })
  })

  test.test('API: sendMessageBatch', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessageBatch')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS SEND_BATCH to our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'send_batch', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        // Ensure the request sent to SQS included trace-context in message
        // attributes.  The mock server parses the sent urlencoded body into an
        // object on req.body.
        t.equal(app._receivedReqs.length, 1)
        const req = app._receivedReqs[0]
        t.equal(req.body.Action, 'SendMessageBatch', 'req.body.Action')
        // The fixture has 3 message attributes, so traceparent and tracestate
        // should be attributes 4 and 5.
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.4.Name'], 'traceparent', 'traceparent message attribute Name')
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.4.Value.DataType'], 'String', 'traceparent message attribute DataType')
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.4.Value.StringValue'], `00-${spanSqs.trace_id}-${spanSqs.id}-01`, 'traceparent message attribute StringValue')
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.5.Name'], 'tracestate', 'tracestate message attribute Name')
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.5.Value.DataType'], 'String', 'tracestate message attribute DataType')
        t.equal(req.body['SendMessageBatchRequestEntry.1.MessageAttribute.5.Value.StringValue'], 'es=s:1', 'tracestate message attribute StringValue')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessageBatch', listener.address().port)
      sqs.sendMessageBatch(params, function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  // Test that SQS trace-context propagation works properly when called in an
  // unsampled transaction.
  test.test('API: sendMessage, unsampled transaction', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessage')
    )
    const listener = app.listen(0, function () {
      // Note: This test is relying on _mock_http_client behaving like a
      // a pre-8.0 APM server, where unsampled transactions are still
      // sent to APM server (`supportsKeepingUnsampledTransaction()` -> true).
      resetAgent(function (data) {
        t.equal(data.spans.length, 0, 'no SQS span was sent')

        // Ensure the request sent to SQS included trace-context in message
        // attributes.  The mock server parses the sent urlencoded body into an
        // object on req.body.
        t.equal(app._receivedReqs.length, 1)
        const req = app._receivedReqs[0]
        t.equal(req.body.Action, 'SendMessage', 'req.body.Action')
        // The fixture has 3 message attributes, so traceparent should be
        // attr 4. No 'tracestate' should be sent for a non-root transaction.
        t.equal(req.body['MessageAttribute.4.Name'], 'traceparent', 'traceparent message attribute Name')
        t.equal(req.body['MessageAttribute.4.Value.DataType'], 'String', 'traceparent message attribute DataType')
        t.equal(req.body['MessageAttribute.4.Value.StringValue'], t0.traceparent, 'traceparent message attribute StringValue')
        t.equal(req.body['MessageAttribute.5.Name'], undefined, 'there is no "tracestate" message attribute')

        t.end()
      })

      const TRACEPARENT_SAMPLED_FALSE = '00-12345678901234567890123456789012-1234567890123456-00'
      const t0 = agent.startTransaction('t0', { childOf: TRACEPARENT_SAMPLED_FALSE })

      setImmediate(() => {
        const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
        const params = getParams('sendMessage', listener.address().port)
        sqs.sendMessage(params, function (err, data) {
          t.error(err)
          t0.end()
          listener.close()
        })
      })
    })
  })

  test.test('API: deleteMessage', function (t) {
    const app = createMockServer(
      getXmlResponse('deleteMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS DELETE from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'delete', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('deleteMessage', listener.address().port)
      sqs.deleteMessage(params, function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: deleteMessageBatch', function (t) {
    const app = createMockServer(
      getXmlResponse('deleteMessageBatch')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS DELETE_BATCH from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'delete_batch', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('deleteMessageBatch', listener.address().port)
      sqs.deleteMessageBatch(params, function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: receiveMessage', function (t) {
    const app = createMockServer(
      getXmlResponse('receiveMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS POLL from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'poll', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')
        t.deepEqual(spanSqs.links, [{
          trace_id: '460d51b6ed3ab96be45f2580b8016509',
          span_id: '8ba4419207a1f2f8'
        }], 'span.links')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('receiveMessage', listener.address().port)
      sqs.receiveMessage(params, function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: receiveMessage no transaction', function (t) {
    const app = createMockServer(
      getXmlResponse('receiveMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 0, 'no spans without a transaction')
        t.end()
      })

      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('receiveMessage', listener.address().port)
      sqs.receiveMessage(params, function (err, data) {
        t.error(err)
        listener.close()
      })
    })
  })

  test.test('API: sendMessage without a transaction', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 0, 'no spans without a transaction')
        t.end()
      })
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessage', listener.address().port)
      sqs.sendMessage(params, function (err, data) {
        t.error(err)
        listener.close()
      })
    })
  })

  test.test('API: sendMessageBatch without a transaction', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 0, 'no spans without a transaction')
        t.end()
      })
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessageBatch', listener.address().port)
      sqs.sendMessageBatch(params, function (err, data) {
        t.error(err)
        listener.close()
      })
    })
  })

  test.test('API: sendMessage promise', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS SEND to our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'send', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessage', listener.address().port)
      const request = sqs.sendMessage(params).promise()
      t.ok(agent.currentSpan === null, 'no currentSpan in sync code after sqs.sendMessage(...).promise()')

      request.then(
        function (data) {
          t.ok(agent.currentSpan === null, 'no currentSpan in SQS promise resolve')
          awsPromiseFinally(agent, listener)
        },
        function (err) {
          t.ok(agent.currentSpan === null, 'no currentSpan in SQS promise reject')
          t.fail(err)
          awsPromiseFinally(agent, listener)
        }
      )
    })
  })

  test.test('API: sendMessageBatch promise', function (t) {
    const app = createMockServer(
      getXmlResponse('sendMessageBatch')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS SEND_BATCH to our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'send_batch', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('sendMessageBatch', listener.address().port)
      const promise = sqs.sendMessageBatch(params).promise()
      promise.then(
        function (data) {
          awsPromiseFinally(agent, listener)
        },
        function (err) {
          t.fail(err)
          awsPromiseFinally(agent, listener)
        }
      )
    })
  })
  test.test('API: deleteMessage promise', function (t) {
    const app = createMockServer(
      getXmlResponse('deleteMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS DELETE from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'delete', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('deleteMessage', listener.address().port)
      const promise = sqs.deleteMessage(params).promise()
      promise.then(
        function (data) {
          awsPromiseFinally(agent, listener)
        },
        function (err) {
          t.fail(err)
          awsPromiseFinally(agent, listener)
        }
      )
    })
  })

  test.test('API: deleteMessageBatch promise', function (t) {
    const app = createMockServer(
      getXmlResponse('deleteMessageBatch')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS DELETE_BATCH from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'delete_batch', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('deleteMessageBatch', listener.address().port)
      const promise = sqs.deleteMessageBatch(params).promise()
      promise.then(
        function (data) {
          awsPromiseFinally(agent, listener)
        },
        function (err) {
          t.fail(err)
          awsPromiseFinally(agent, listener)
        }
      )
    })
  })

  test.test('API: receiveMessage promise', function (t) {
    const app = createMockServer(
      getXmlResponse('receiveMessage')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.spans.length, 1, 'generated one span')
        const spanSqs = data.spans[0]

        t.equals(spanSqs.name, 'SQS POLL from our-queue', 'SQS span named correctly')
        t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        t.equals(spanSqs.action, 'poll', 'span action matches API method called')
        t.deepEqual(spanSqs.context.service.target,
          { type: 'sqs', name: 'our-queue' },
          'span.context.service.target')
        t.deepEqual(spanSqs.context.destination, {
          address: 'sqs.us-west.amazonaws.com',
          port: 443,
          cloud: { region: 'us-west' },
          service: { type: '', name: '', resource: 'sqs/our-queue' }
        }, 'span.context.destination')
        t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')
        t.deepEqual(spanSqs.links, [{
          trace_id: '460d51b6ed3ab96be45f2580b8016509',
          span_id: '8ba4419207a1f2f8'
        }], 'span.links')

        t.end()
      })
      agent.startTransaction('myTransaction')
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      const params = getParams('receiveMessage', listener.address().port)
      const promise = sqs.receiveMessage(params).promise()
      promise.then(
        function (data) {
          awsPromiseFinally(agent, listener)
        },
        function (err) {
          t.fail(err)
          awsPromiseFinally(agent, listener)
        }
      )
    })
  })

  test.end()
})

function awsPromiseFinally (agent, listener) {
  agent.endTransaction()
  listener.close()
}

function createMockServer (xmlResponse) {
  const app = express()
  app._receivedReqs = []
  app.use(bodyParser.urlencoded({ extended: false }))
  app.post('/', (req, res) => {
    app._receivedReqs.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    })
    res.setHeader('Content-Type', 'text/xml')
    res.send(xmlResponse)
  })
  return app
}

function getXmlResponse (method) {
  return fixtures[method].response
}

function getParams (method, port) {
  const params = fixtures[method].request
  params.QueueUrl = `http://localhost:${port}/1/our-queue`
  return params
}

function initializeAwsSdk () {
  // SDk requires a region to be set
  AWS.config.update({ region: 'us-west' })

  // without fake credentials the aws-sdk will attempt to fetch
  // credentials as though it was on an EC2 instance
  process.env.AWS_ACCESS_KEY_ID = 'fake-1'
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-2'
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._apmClient = mockClient(cb)
}
