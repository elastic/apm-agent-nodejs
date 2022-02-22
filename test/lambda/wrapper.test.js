'use strict'
const tape = require('tape')
const path = require('path')
const { getLambdaHandler } = require('../../lib/lambda')
tape.test('unit tests for getLambdaHandler', function (suite) {
  suite.test('returns false-ish in non-lambda places', function (t) {
    t.ok(!getLambdaHandler())
    t.end()
  })

  suite.test('extracts info with expected env variables', function (t) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo'

    const handler = getLambdaHandler({
      _HANDLER: 'foo.bar',
      LAMBDA_TASK_ROOT: '/var/task'
    })
    t.equals(handler.filePath, '/var/task/foo.js', 'extracted handler file path')
    t.equals(handler.module, 'foo', 'extracted handler module')
    t.equals(handler.field, 'bar', 'extracted handler field')
    t.end()
  })

  suite.test('no task root', function (t) {
    const handler = getLambdaHandler({
      _HANDLER: 'foo.bar'
    })
    t.ok(!handler, 'no value when task root missing')
    t.end()
  })

  suite.test('no handler', function (t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT: '/var/task'
    })
    t.ok(!handler, 'no value when handler missing')
    t.end()
  })

  suite.test('malformed handler: too few', function (t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT: '/var/task',
      _HANDLER: 'foo'
    })

    t.ok(!handler, 'no value for malformed handler')
    t.end()
  })

  suite.test('malformed handler: too many', function (t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT: '/var/task',
      _HANDLER: 'foo.baz.bar'
    })
    t.ok(!handler, 'no value for malformed handler')
    t.end()
  })

  suite.end()
  // t.end()
})

tape.test('integration test', function (t) {
  if (process.platform === 'win32') {
    t.pass('skipping for windows')
    t.end()
    return
  }
  // fake the enviornment
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo'
  process.env.LAMBDA_TASK_ROOT = path.join(__dirname, 'fixtures')
  process.env._HANDLER = 'lambda.foo'

  // load and start The Real agent
  require('../..').start({
    serviceName: 'lambda test',
    breakdownMetrics: false,
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    cloudProvider: 'none',
    spanStackTraceMinDuration: 0, // Always have span stacktraces.
    transport: function () {}
  })

  // check that the handler fixture is wrapped
  const handler = require(path.join(__dirname, '/fixtures/lambda')).foo
  t.equals(handler.name, 'wrappedLambda', 'handler function wrapped correctly')
  t.end()
})
