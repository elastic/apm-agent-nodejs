'use strict'
const tape = require('tape')
const {getToFromFromOperation,
  getActionFromRequest,
  getQueueNameFromRequest,
  getRegionFromRequest,
  getMessagingDestinationContextFromRequest,
  shouldIgnoreRequest
}
  = require('../../../../lib/instrumentation/modules/aws-sdk/sqs')

tape.test('AWS SQS: Unit Test Functions', function(test){
  test.test('function getToFromFromOperation', function(t) {
    t.equals(getToFromFromOperation('deleteMessage'), 'from')
    t.equals(getToFromFromOperation('deleteMessageBatch'), 'from')
    t.equals(getToFromFromOperation('receiveMessage'), 'from')
    t.equals(getToFromFromOperation('sendMessageBatch'), 'to')
    t.equals(getToFromFromOperation('sendMessage'), 'to')
    t.end()
  })

  test.test('function getActionFromOperation', function(t) {
    const request = {}

    request.operation = 'deleteMessage'
    t.equals(getActionFromRequest(request), 'delete')

    request.operation = 'deleteMessageBatch'
    t.equals(getActionFromRequest(request), 'delete_batch')

    request.operation = 'receiveMessage'
    t.equals(getActionFromRequest(request), 'receive')

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
    t.equals(getActionFromRequest(request), 'receive')

    request.operation = 'receiveMessage'
    request.params = {WaitTimeSeconds:0}
    t.equals(getActionFromRequest(request), 'receive')

    request.operation = 'receiveMessage'
    request.params = {WaitTimeSeconds:-1}
    t.equals(getActionFromRequest(request), 'receive')

    request.operation = 'receiveMessage'
    request.params = {WaitTimeSeconds:1}
    t.equals(getActionFromRequest(request), 'poll')
    t.end()
  })

  test.test('function getQueueNameFromRequest', function(t) {
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

  test.test('function getRegionFromRequest', function(t) {
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

  test.test('function shouldIgnoreRequest', function(t) {
    t.equals(shouldIgnoreRequest(null, null), true)

    const request = {
      operation:'deleteMessage',
      params: {
        QueueUrl: 'http://foo/baz/bar/bing?some=params&ok=true'
      }
    }
    const agent = {
      _conf: {
        ignoreMessageQueuesRegExp: []
      }
    }
    t.equals(shouldIgnoreRequest(request, agent), false)

    agent._conf.ignoreMessageQueuesRegExp.push(/b.*g/)
    t.equals(shouldIgnoreRequest(request, agent), true)

    agent.operation = 'fakeMethod'
    t.equals(shouldIgnoreRequest(request, agent), true)

    t.end()
  })

  test.test('function getMessagingDestinationContext', function(t) {
    const request = {
      service: {
        config:{
          region:'region-name'
        }
      },
      params: {
        QueueUrl:'http://foo/baz/bar/bing?some=params&ok=true'
      }
    }

    t.equals(getRegionFromRequest(request), 'region-name')
    t.equals(getQueueNameFromRequest(request), 'bing')

    t.deepEquals(getMessagingDestinationContextFromRequest(request), {
      service:{
        name:'sqs',
        resource:`sqs/bing`,
        type: 'messaging'
      },
      cloud:{
        region:'region-name'
      }
    })
    t.end()
  })

  test.end()
})
