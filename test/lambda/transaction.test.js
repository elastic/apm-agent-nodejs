const tape = require('tape')

const AgentMock = require('./mock/agent')

const { elasticApmAwsLambda, setLambdaTransactionData } = require('../../lib/lambda')
class MockTransaction {
  constructor () {
    this.faas = null
  }

  setFaas (data) {
    this.faas = data
  }
}

tape.test('setLambdaTransactionData unit tests', function (t) {
  const transaction = new MockTransaction()
  const event = {
    version: '2.0',
    routeKey: 'ANY /the-function-name',
    rawPath: '/default/the-function-name',
    rawQueryString: '',
    headers: {
      accept: '*/*',
      'content-length': '0',
      host: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
      'user-agent': 'curl/7.64.1',
      'x-amzn-trace-id': 'Root=1-611598fd-16b2bd060ca70cab7eb87c47',
      'x-forwarded-for': '67.171.184.49',
      'x-forwarded-port': '443',
      'x-forwarded-proto': 'https'
    },
    requestContext: {
      accountId: 'XXXXXXXXXXXX',
      apiId: '21mj4tsk90',
      domainName: '21mj4tsk90.execute-api.us-west-2.amazonaws.com',
      domainPrefix: '21mj4tsk90',
      http: {
        method: 'GET',
        path: '/default/the-function-name',
        protocol: 'HTTP/1.1',
        sourceIp: '67.171.184.49',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'D-TXmgKqPHcEJMg=',
      routeKey: 'ANY /the-function-name',
      stage: 'default',
      time: '12/Aug/2021:21:56:13 +0000',
      timeEpoch: 1628805373222
    },
    isBase64Encoded: false
  }

  const context = {
    callbackWaitsForEmptyEventLoop: true,
    functionVersion: '$LATEST',
    functionName: 'the-function-name',
    memoryLimitInMB: '128',
    logGroupName: '/aws/lambda/the-function-name',
    logStreamName: '2021/08/13/[$LATEST]08834acf4e4f463b95b7b99aa8b34aff',
    invokedFunctionArn: 'arn:aws:lambda:us-west-2:XXXXXXXXXXXX:function:the-function-name',
    awsRequestId: '649bf7d0-c6ae-432d-899d-da44ccd7ee95'
  }
  const isColdStart = true

  setLambdaTransactionData(transaction, event, context, isColdStart)
  t.strictEquals(transaction.faas.coldstart, true, 'colstart value set')
  t.strictEquals(transaction.faas.execution, context.awsRequestId, 'execution value set')
  t.strictEquals(transaction.faas.trigger.type, 'http', 'execution value set')
  t.strictEquals(transaction.faas.trigger.request_id, event.requestContext.requestId, 'execution value set')
  t.end()
})

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

  t.equals(cold.faas.coldstart, true, 'first invocation is a cold start')
  t.equals(warm.faas.coldstart, false, 'second invocation is not a cold start')
  t.end()
})
