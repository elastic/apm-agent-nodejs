'use strict'

function assertContext (t, name, received, expected, input, output) {
  t.ok(received)
  const lambda = received.lambda
  t.ok(lambda, 'context data has lambda object')
  t.strictEqual(lambda.functionName, name, 'function name matches')
  t.strictEqual(lambda.functionVersion, expected.functionVersion, 'function version matches')
  t.strictEqual(lambda.invokedFunctionArn, expected.invokedFunctionArn, 'function ARN matches')
  t.strictEqual(lambda.memoryLimitInMB, expected.memoryLimitInMB, 'memory limit matches')
  t.strictEqual(lambda.awsRequestId, expected.awsRequestId, 'AWS request ID matches')
  t.strictEqual(lambda.logGroupName, expected.logGroupName, 'log group name matches')
  t.strictEqual(lambda.logStreamName, expected.logStreamName, 'log group name matches')
  t.strictEqual(lambda.executionEnv, process.env.AWS_EXECUTION_ENV, 'execution env matches')
  t.strictEqual(lambda.region, process.env.AWS_REGION, 'region matches')
  t.deepEqual(lambda.input, input, 'input matches')
  t.deepEqual(lambda.output, output, 'output matches')
}

function assertError (t, received, expected) {
  t.strictEqual(received, expected)
}

function assertTransaction (t, trans, name, context, input, output) {
  t.strictEqual(trans.name, name)
  t.ok(trans.ended)
  assertContext(t, name, trans.customContext, context, input, output)
}

module.exports = {
  assertContext,
  assertError,
  assertTransaction
}
