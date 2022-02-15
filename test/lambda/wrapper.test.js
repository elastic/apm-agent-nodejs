const tape = require('tape')
const { getLambdaHandler } = require('../../lib/lambda')
tape.test(function(suite){
  suite.test('returns false-ish in non-lambda places', function(t){
    t.ok(!getLambdaHandler())
    t.end()
  })

  suite.test('extracts info with expected env variables', function(t){
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'foo'

    const handler = getLambdaHandler({
      _HANDLER:'foo.bar',
      LAMBDA_TASK_ROOT:'/var/task'
    })
    t.equals(handler.filePath, '/var/task/foo.js', 'extacted handler file path')
    t.equals(handler.module, 'foo', 'extacted handler module')
    t.equals(handler.field, 'bar', 'extacted handler field')
    t.end()
  })

  suite.test('no task root', function(t) {
    const handler = getLambdaHandler({
      _HANDLER:'foo.bar',
    })
    t.ok(!handler, 'no value when task root missing')
    t.end()
  })

  suite.test('no handler', function(t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT:'/var/task'
    })
    t.ok(!handler, 'no value when handler missing')
    t.end()
  })

  suite.test('malformed handler: too few', function(t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT:'/var/task',
      _HANDLER:'foo',
    })

    t.ok(!handler, 'no value for maleformed handler')
    t.end()
  })

  suite.test('malformed handler: too many', function(t) {
    const handler = getLambdaHandler({
      LAMBDA_TASK_ROOT:'/var/task',
      _HANDLER:'foo.baz.bar',
    })
    t.ok(!handler, 'no value for maleformed handler')
    t.end()
  })

  suite.end()
  // t.end()
})
