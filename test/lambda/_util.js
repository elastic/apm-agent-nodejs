function assertContext (t, name, received, expected, input, output) {
  t.ok(received)
  const lambda = received.lambda
  t.ok(lambda, 'context data has lambda object')
  t.equal(lambda.functionName, name, 'function name matches')
  t.equal(lambda.functionVersion, expected.functionVersion, 'function version matches')
  t.equal(lambda.invokedFunctionArn, expected.invokedFunctionArn, 'function ARN matches')
  t.equal(lambda.memoryLimitInMB, expected.memoryLimitInMB, 'memory limit matches')
  t.equal(lambda.awsRequestId, expected.awsRequestId, 'AWS request ID matches')
  t.equal(lambda.logGroupName, expected.logGroupName, 'log group name matches')
  t.equal(lambda.logStreamName, expected.logStreamName, 'log group name matches')
  t.equal(lambda.executionEnv, process.env.AWS_EXECUTION_ENV, 'execution env matches')
  t.equal(lambda.region, process.env.AWS_REGION, 'region matches')
  t.deepEqual(lambda.input, input, 'input matches')
  t.deepEqual(lambda.output, output, 'output matches')
}

function assertError (t, received, expected) {
  t.equal(received, expected)
}

function assertTransaction (t, trans, name, context, input, output) {
  t.equal(trans.name, name)
  t.equal(trans.type, 'lambda')
  t.ok(trans.ended)
  assertContext(t, name, trans.customContext, context, input, output)
}

module.exports = {
  assertContext,
  assertError,
  assertTransaction
}
