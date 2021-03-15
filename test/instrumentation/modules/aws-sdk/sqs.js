'use strict'
const tape = require('tape')
const {getToFromFromOperation} = require('../../../../lib/instrumentation/modules/aws-sdk/sqs')

tape.test('AWS SQS: Unit Test Functions', function(test){
  test.test('getToFromFromOperation', function(t) {
    t.equals(getToFromFromOperation('deleteMessage'), 'from')
    t.equals(getToFromFromOperation('deleteMessageBatch'), 'from')
    t.equals(getToFromFromOperation('receiveMessage'), 'from')
    t.equals(getToFromFromOperation('sendMessageBatch'), 'to')
    t.equals(getToFromFromOperation('sendMessage'), 'to')
    t.end()
  })
  test.end()
})
