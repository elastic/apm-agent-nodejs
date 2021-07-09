const tape = require('tape')
const snsInstrumentation = require('../../../../lib/instrumentation/modules/aws-sdk/sns')
tape.test('AWS SNS: Unit Test Functions', function (t) {
  t.ok(snsInstrumentation, 'loaded module')
  t.end()
})
