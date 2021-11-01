const tape = require('tape')

const AgentMock = require('./mock/agent')

const { elasticApmAwsLambda } = require('../../lib/lambda')

function loadFixture (file) {
  return require('./fixtures/' + file)
}

tape.test('cold start tests', function (t) {
  function mockLambda () {

  }
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(mockLambda)
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

tape.test('setLambdaTransactionData aws_api_http_test_data tests', function (t) {
  const mockAgent = new AgentMock()
  const wrapLambda = elasticApmAwsLambda(mockAgent)
  const wrappedMockLambda = wrapLambda(function () {})

  const event = loadFixture('aws_api_http_test_data')
  const context = loadFixture('context')
  wrappedMockLambda(event, context)
  const transaction = mockAgent.transactions.shift()

  t.strictEquals(transaction._faas.coldstart, false, 'colstart value set')
  t.strictEquals(transaction._faas.execution, context.awsRequestId, 'execution value set')
  t.strictEquals(transaction._faas.trigger.type, 'http', 'execution value set')
  t.strictEquals(transaction._faas.trigger.request_id, event.requestContext.requestId, 'execution value set')
  t.strictEquals(transaction.outcome, 'success', 'outcome set')
  t.strictEquals(transaction.type, 'http', 'transaction type set')
  t.strictEquals(transaction.name, 'GET the-function-name', 'transaction named correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._service.origin.name, 'GET /default/the-function-name/default', 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, '21mj4tsk90', 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, '2.0', 'service origin version set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'api gateway', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, 'XXXXXXXXXXXX', 'cloud origin service name set correctly')
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
  t.strictEquals(transaction.outcome, 'success', 'outcome set')
  t.strictEquals(transaction.type, 'http', 'transaction type set')
  t.strictEquals(transaction.name, 'GET the-function-name', 'transaction named correctly')
  t.strictEquals(transaction._service.origin.name, 'GET /fetch_all/dev', 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, '02plqthge2', 'service origin id set correctly')
  t.strictEquals(transaction._service.origin.version, undefined, 'service origin version set correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'api gateway', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, '571481734049', 'cloud origin service name set correctly')
  t.end()
})

tape.test('setLambdaTransactionData aws_sqs_test_data.json tests', function (t) {
  const mockAgent = new AgentMock()
  mockAgent._conf.captureBody = true
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
  t.strictEquals(transaction._faas.trigger.requestId, r.messageId, 'trigger type set')
  t.strictEquals(transaction.type, 'messaging', 'transaction type set')
  t.strictEquals(transaction.name, `RECEIVE ${queueName}`, 'transaction named correctly')
  t.strictEquals(transaction._service.origin.name, queueName, 'service origin name set correctly')
  t.strictEquals(transaction._service.origin.id, r.eventSourceARN, 'service origin id set correctly')
  t.strictEquals(transaction._cloud.origin.provider, 'aws', 'cloud origin provider set correctly')
  t.strictEquals(transaction._cloud.origin.service.name, 'sqs', 'cloud origin service name set correctly')
  t.strictEquals(transaction._cloud.origin.region, 'us-east-1', 'cloud origin region name set correctly')
  t.strictEquals(transaction._cloud.origin.account.id, accountId, 'cloud origin account id set correctly')
  t.strictEquals(transaction._message.queue, r.eventSourceARN, 'message queue set correctly')
  t.strictEquals(typeof transaction._message.age, 'number', 'message age is a number')
  t.strictEquals(transaction._message.body, r.body, 'message body set correctly')
  t.deepEquals(transaction._message.headers, r.attributes, 'message headers set correctly')

  t.end()
})
