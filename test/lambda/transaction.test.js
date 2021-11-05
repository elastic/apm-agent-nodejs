const tape = require('tape')

const AgentMock = require('./mock/agent')

const { elasticApmAwsLambda } = require('../../lib/lambda')

function loadFixture (file) {
  return require('./fixtures/' + file)
}

tape.test('cold start tests', function (t) {
  function myHandler () {

  }
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(myHandler)
  const mockEvent = {}
  const mockContext = {}

  // invoke the mock lambda twice
  wrappedMockLambda(mockEvent, mockContext)
  wrappedMockLambda(mockEvent, mockContext)

  const cold = mockAgent.transactions.shift()
  const warm = mockAgent.transactions.shift()

  t.equals(cold._faas.coldstart, true, 'first invocation is a cold start')
  t.equals(warm._faas.coldstart, false, 'second invocation is not a cold start')
  t.end()
})

tape.test('setLambdaTransactionData aws_api_http_test_data tests', async function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_api_http_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  t.strictEquals(typeof transaction._faas.coldstart, 'boolean', 'coldstart value set')
  t.strictEquals(transaction._faas.execution, context.awsRequestId, 'execution value set')
  t.strictEquals(transaction._faas.trigger.type, 'http', 'execution value set')
  t.strictEquals(transaction._faas.trigger.request_id, event.requestContext.requestId, 'execution value set')
  t.strictEquals(transaction.type, 'request', 'transaction type set')
  t.strictEquals(transaction.name, 'GET the-function-name', 'transaction named correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._service.origin.name, 'GET /the-function-name/default', 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, '21mj4tsk90', 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, '2.0', 'service origin version set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'api gateway', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, '000000000000', 'cloud origin service name set correctly')
  t.end()
})

tape.test('setLambdaTransactionData aws_api_rest_test_data.json tests', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_api_rest_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
  t.strictEquals(transaction._faas.execution, context.awsRequestId, 'execution value set')
  t.strictEquals(transaction._faas.trigger.type, 'http', 'trigger type set')
  t.strictEquals(transaction._faas.trigger.request_id, event.requestContext.requestId, 'execution value set')
  t.strictEquals(transaction.type, 'request', 'transaction type set')
  t.strictEquals(transaction.name, 'GET the-function-name', 'transaction named correctly')
  t.strictEquals(transaction._service.origin.name, 'GET /fetch_all/dev', 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, '02plqthge2', 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, '1.0', 'service origin version set correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'api gateway', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, '571481734049', 'cloud origin service name set correctly')
  t.end()
})

tape.test('setLambdaTransactionData aws_sqs_test_data.json tests', function (t) {
  const mockAgent = new AgentMock()
  mockAgent._conf.captureBody = 'all'
  mockAgent._conf.captureHeaders = 'all'
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_sqs_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  const r = event.Records[0]
  const arnParts = r.eventSourceARN.split(':')
  const queueName = arnParts.pop()
  const accountId = arnParts.pop()
  t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
  t.strictEquals(transaction._faas.execution, context.awsRequestId, 'execution value set')
  t.strictEquals(transaction._faas.trigger.type, 'pubsub', 'trigger type set')
  t.strictEquals(transaction._faas.trigger.request_id, r.messageId, 'trigger request_id')
  t.strictEquals(transaction.type, 'messaging', 'transaction type set')
  t.strictEquals(transaction.name, `RECEIVE ${queueName}`, 'transaction named correctly')
  t.strictEquals(transaction._service.origin.name, queueName, 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, r.eventSourceARN, 'service origin id set correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'sqs', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.region, 'us-east-1', 'cloud origin region name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, accountId, 'cloud origin account id set correctly')
  t.strictEquals(transaction._message.queue.name, queueName, 'message queue set correctly')
  t.strictEquals(typeof transaction._message.age.ms, 'number', 'message age is a number')
  t.strictEquals(transaction._message.body, r.body, 'message body set correctly')
  t.deepEquals(transaction._message.headers, r.messageAttributes, 'message headers set correctly')

  t.end()
})

tape.test('setLambdaTransactionData aws_sns_test_data.json tests', function (t) {
  const mockAgent = new AgentMock()
  mockAgent._conf.captureBody = 'transactions'
  mockAgent._conf.captureHeaders = true
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_sns_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  const r = event.Records[0]
  const arnParts = r.Sns.TopicArn.split(':')
  const topicName = arnParts.pop()
  const accountId = arnParts.pop()

  t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
  t.strictEquals(transaction._faas.trigger.type, 'pubsub', 'trigger type set')
  t.strictEquals(transaction._faas.trigger.request_id, r.Sns.MessageId, 'trigger request_id set')
  t.strictEquals(transaction.type, 'messaging', 'transaction type set')
  t.strictEquals(transaction.name, `RECEIVE ${topicName}`, 'transaction named correctly')
  t.strictEquals(transaction._service.origin.name, topicName, 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, r.Sns.TopicArn, 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, r.EventVersion, 'service origin version set correctly')

  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'sns', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.region, 'us-east-1', 'cloud origin region name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, accountId, 'cloud origin account id set correctly')

  t.strictEquals(transaction._message.queue.name, topicName, 'message queue set correctly')
  t.strictEquals(typeof transaction._message.age.ms, 'number', 'message age is a number')
  t.strictEquals(transaction._message.body, r.Sns.Message, 'message body set correctly')
  t.deepEquals(transaction._message.headers, r.Sns.MessageAttributes, 'message headers set correctly')

  t.end()
})

tape.test('setLambdaTransactionData aws_s3_test_data.json tests', function (t) {
  const mockAgent = new AgentMock()
  mockAgent._conf.captureBody = 'all'
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_s3_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
  t.strictEquals(transaction._faas.trigger.type, 'datasource', 'trigger type set')
  t.strictEquals(transaction._faas.trigger.request_id, '0FM18R15SDX52CT2', 'trigger request id set')
  t.strictEquals(transaction.type, 'request', 'transaction type set')
  t.strictEquals(transaction.name, 'ObjectCreated:Put basepitestbucket', 'transaction named correctly')

  t.strictEquals(transaction._service.origin.name, 'basepitestbucket', 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, 'arn:aws:s3:::basepitestbucket', 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, '2.1', 'service origin version set correctly')

  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 's3', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.region, 'us-east-1', 'cloud origin region name set correctly')

  t.end()
})

tape.test('setLambdaTransactionData generic tests', function (t) {
  const mockAgent = new AgentMock()
  mockAgent._conf.captureBody = 'transactions'
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const fixtures = ['generic', 'aws_s3_batch_test_data']
  for (const [, fixture] of fixtures.entries()) {
    const event = loadFixture(fixture)
    const context = loadFixture('context')
    wrappedMockLambda(event, context)
    const transaction = mockAgent.transactions.shift()

    t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
    t.strictEquals(transaction._faas.trigger.type, 'other', 'trigger type set')
    t.strictEquals(transaction._faas.execution, context.awsRequestId, 'execution value set')

    t.strictEquals(transaction.type, 'request', 'transaction type set')
    t.strictEquals(transaction.name, 'the-function-name', 'transaction named correctly')
    t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  }
  t.end()
})

tape.test('serialize transaction lambda fields', function (t) {
  const mockAgent = new AgentMock()
  const Transaction = require('../../lib/instrumentation/transaction')
  const transaction = new Transaction(mockAgent)
  transaction._context.traceparent = { recorded: true }

  transaction.name = 'one'
  transaction.type = 'two'
  transaction.outcome = 'failure'
  transaction.result = 'success'

  const afterBasic = transaction.toJSON()
  t.strictEquals(afterBasic.name, transaction.name, 'name serialized')
  t.strictEquals(afterBasic.type, transaction.type, 'type serialized')
  t.strictEquals(afterBasic.outcome, transaction.outcome, 'outcome serialized')
  t.strictEquals(afterBasic.result, transaction.result, 'result serialized')

  t.strictEquals(afterBasic.faas, undefined, 'faas is not defined yet')
  t.deepEquals(afterBasic.context.service, {}, 'service is not defined yet')
  t.deepEquals(afterBasic.context.cloud, {}, 'service is not defined yet')
  t.deepEquals(afterBasic.context.message, {}, 'message is not defined yet')

  const faas = {
    coldstart: 'three',
    execution: 'four',
    trigger: {
      type: 'five',
      request_id: 'six'
    }
  }
  transaction.setFaas(faas)
  const afterFaas = transaction.toJSON()

  t.strictEquals(afterFaas.faas.coldstart, faas.coldstart, 'coldstart serialized')
  t.strictEquals(afterFaas.faas.execution, faas.execution, 'execution serialized')
  t.strictEquals(afterFaas.faas.trigger.type, faas.trigger.type, 'trigger type serialized')
  t.strictEquals(afterFaas.faas.trigger.request_id, faas.trigger.request_id, 'trigger type serialized')

  const serviceContext = {
    origin: {
      name: 'seven',
      id: 'eight',
      version: 'nine'
    }
  }
  transaction.setServiceContext(serviceContext)
  const afterService = transaction.toJSON()
  t.strictEquals(afterService.context.service.name, serviceContext.coldstart, 'service name serialized')
  t.strictEquals(afterService.context.service.id, serviceContext.id, 'service id serialized')
  t.strictEquals(afterService.context.service.version, serviceContext.version, 'service version serialized')

  const cloudContext = {
    origin: {
      provider: 'ten',
      service: {
        name: 'eleven'
      },
      account: {
        id: 'twelve'
      },
      region: 'thirteen'
    }
  }
  transaction.setCloudContext(cloudContext)
  const afterCloud = transaction.toJSON()

  t.strictEquals(afterCloud.context.cloud.origin.provider, cloudContext.origin.provider, 'cloud origin provider serialized')
  t.strictEquals(afterCloud.context.cloud.origin.service.name, cloudContext.origin.service.name, 'cloud origin service name serialized')
  t.strictEquals(afterCloud.context.cloud.origin.account.id, cloudContext.origin.account.id, 'cloud origin account id serialized')
  t.strictEquals(afterCloud.context.cloud.origin.region, cloudContext.origin.region, 'cloud origin region serialized')

  const messageContext = {
    queue: 'fourteen',
    age: 'fifteen',
    body: 'sixteen',
    headers: { seventeen: 'eighteen' }
  }
  transaction.setMessageContext(messageContext)
  const afterMessage = transaction.toJSON()

  t.strictEquals(afterMessage.context.message.queue, messageContext.queue)
  t.strictEquals(afterMessage.context.message.age, messageContext.age)
  t.strictEquals(afterMessage.context.message.body, messageContext.body)
  t.deepEquals(afterMessage.context.message.headers, messageContext.headers)

  t.end()
})

tape.test('setLambdaTransactionData invalid objects', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})
  const emptyGatewayEvent = {
    requestContext: {
      requestId: 'abc123'
    }
  }
  const emptySqsEvent = {
    Records: [{
      eventSource: 'aws:sqs'
    }]
  }
  const emptySnsEvent = {
    Records: [{
      eventSource: 'aws:sns'
    }]
  }
  const emptyS3Event = {
    Records: [{
      eventSource: 'aws:s3'
    }]
  }
  const fixtures = [emptyGatewayEvent, emptySqsEvent,
    emptySqsEvent, emptySnsEvent, emptyS3Event]

  for (const [, event] of fixtures.entries()) {
    wrappedMockLambda(event, {})
    t.pass('no exceptions thrown or crashing errors')
  }

  t.end()
})

tape.test('transaction.result failure: thrown error', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {
    throw new Error('oh no, an error')
  })

  wrappedMockLambda({}, {}, function (err, result) {
    t.ok(err)
    const transaction = mockAgent.transactions.shift()
    t.equals(transaction.result, 'failure', 'result is failure')
    t.end()
  })
})

tape.test('transaction.result failure: callback error', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function (event, context, callback) {
    const err = new Error('oh no, an error')
    callback(err, null)
  })

  wrappedMockLambda({}, {}, function (err, result) {
    t.ok(err)
    const transaction = mockAgent.transactions.shift()
    t.equals(transaction.result, 'failure', 'result is failure')
    t.end()
  })
})

tape.test('transaction.result failure: api gateway failure', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {
    throw new Error('oh no, an error')
  })
  const emptyGatewayEvent = {
    requestContext: {
      requestId: 'abc123'
    }
  }
  wrappedMockLambda(emptyGatewayEvent, {}, function (err, result) {
    t.ok(err)
    const transaction = mockAgent.transactions.shift()
    t.equals(transaction.result, 'HTTP 5xx', 'result is failure')
    t.end()
  })
})
