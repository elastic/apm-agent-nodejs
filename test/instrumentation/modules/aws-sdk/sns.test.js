const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: 'none',
  logLevel: 'off',
  cloudProvider: 'none',
  ignoreMessageQueues: [
    'arn:aws:sns:us-west-2:111111111111:ignore-name'
  ]
})

const tape = require('tape')
const express = require('express')
const bodyParser = require('body-parser')
const AWS = require('aws-sdk')

const {
  getSpanNameFromRequest, getDestinationNameFromRequest, getMessageDestinationContextFromRequest
} = require('../../../../lib/instrumentation/modules/aws-sdk/sns')
const fixtures = require('./fixtures/sns')
const mockClient = require('../../../_mock_http_client')

initializeAwsSdk()

function initializeAwsSdk () {
  // SDk requires a region to be set
  AWS.config.update({ region: 'us-west-2' })

  // without fake credentials the aws-sdk will attempt to fetch
  // credentials as though it was on an EC2 instance
  process.env.AWS_ACCESS_KEY_ID = 'fake-1'
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-2'
}

function createMockServer (fixture) {
  const app = express()
  app.use(bodyParser.urlencoded({ extended: false }))
  app.post('/', (req, res) => {
    res.status(fixture.httpStatusCode)
    res.setHeader('Content-Type', 'text/xml')
    res.send(fixture.response)
  })
  return app
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
}

tape.test('AWS SNS: Unit Test Functions', function (test) {
  test.test('getDestinationNameFromRequest tests', function (t) {
    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name'
      }
    }), 'topic-name')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:111111111111:topic-name'
      }
    }), 'topic-name')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint/withslashes'
      }
    }), 'accesspoint/withslashes')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint/withslashes'
      }
    }), 'accesspoint/withslashes')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'work test',
        Subject: 'Admin',
        PhoneNumber: '15037299028'
      }
    }), '<PHONE_NUMBER>')

    t.equals(getDestinationNameFromRequest(null), undefined)
    t.equals(getDestinationNameFromRequest({}), undefined)
    t.equals(getDestinationNameFromRequest({ params: {} }), undefined)
    t.end()
  })

  test.test('getDestinationNameFromRequest tests', function (t) {
    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'work test',
        Subject: 'Admin',
        PhoneNumber: '15555555555'
      }
    }), 'SNS PUBLISH <PHONE_NUMBER>')

    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:111111111111:accesspoint:withcolons'
      }
    }), 'SNS PUBLISH accesspoint:withcolons')

    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:111111111111:foo:topic-name'
      }
    }), 'SNS PUBLISH topic-name')

    t.equals(getSpanNameFromRequest(null), 'SNS PUBLISH undefined')
    t.equals(getSpanNameFromRequest({}), 'SNS PUBLISH undefined')
    t.equals(getSpanNameFromRequest({ params: {} }), 'SNS PUBLISH undefined')
    t.end()
  })

  test.test('getMessageDestinationContextFromRequest tests', function (t) {
    t.deepEquals(
      getMessageDestinationContextFromRequest({
        operation: 'publish',
        params: {
          Message: 'this is my test, there are many lot like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:111111111111:foo:topic-name'
        },
        service: {
          config: {
            region: 'us-west-2'
          },
          endpoint: {
            hostname: 'example.com',
            port: 1234
          }
        }
      }),
      {
        address: 'example.com',
        port: 1234,
        service: {
          resource: 'sns/topic-name',
          type: 'messaging',
          name: 'sns',
        },
        cloud: { region: 'us-west-2' }
      }
    )

    t.deepEquals(
      getMessageDestinationContextFromRequest(null),
      {
        address: null,
        port: null,
        service: {
          resource: 'sns/undefined',
          type: 'messaging',
          name: 'sns',
        },
        cloud: { region: null }
      }
    )

    t.deepEquals(
      getMessageDestinationContextFromRequest({}),
      {
        address: undefined,
        port: undefined,
        service: {
          resource: 'sns/undefined',
          type: 'messaging',
          name: 'sns',
        },
        cloud: { region: undefined }
      }
    )
    t.end()
  })

  test.end()
})

tape.test('AWS SNS: End to End Test', function (test) {
  test.test('API: publish', function (t) {
    const params = {
      Message: 'this is my test, there are many like it but this one is mine', /* required */
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name'
    }

    const app = createMockServer(
      fixtures.publish
    )
    const listener = app.listen(0, function () {
      const port = listener.address().port
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'messaging').pop()
        t.equals(span.name, 'SNS PUBLISH topic-name', 'span named correctly')
        t.equals(span.type, 'messaging', 'span type correctly set')
        t.equals(span.subtype, 'sns', 'span subtype set correctly')
        t.equals(span.context.message.queue.name, 'topic-name')
        t.equals(span.context.destination.service.resource, 'sns/topic-name')
        t.equals(span.context.destination.service.type, 'messaging')
        t.equals(span.context.destination.service.name, 'sns')
        t.equals(span.context.destination.address, 'localhost')
        t.equals(span.context.destination.port, port)
        t.equals(span.context.destination.cloud.region, 'us-west-2')
        t.end()
      })

      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params).promise()

      // Handle promise's fulfilled/rejected states
      publishTextPromise.then(function (data) {
        agent.endTransaction()
        listener.close()
      }).catch(function (err) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: no transaction', function (t) {
    const params = {
      Message: 'this is my test, there are many like it but this one is mine', /* required */
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name'
    }

    const app = createMockServer(
      fixtures.publish
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'messaging').pop()
        t.ok(!span, 'no messaging span without a transaction')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })

      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params).promise()

      // Handle promise's fulfilled/rejected states
      publishTextPromise.then(function (data) {
        listener.close()
      }).catch(function (err) {
        t.error(err)
        listener.close()
      })
    })
  })

  test.test('API: error', function (t) {
    const params = {
      Message: 'this is my test, there are many like it but this one is mine', /* required */
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name-not-exists'
    }

    const app = createMockServer(
      fixtures.publishNoTopic
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'messaging').pop()
        t.equals(span.outcome, 'failure', 'error produces outcome=failure span')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params).promise()

      // Handle promise's fulfilled/rejected states
      publishTextPromise.then(function (data) {
        agent.endTransaction()
        listener.close()
      }).catch(function (err) {
        t.ok(err, 'error expected')
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: listTopics', function (t) {
    const app = createMockServer(
      fixtures.listTopics
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'messaging').pop()
        t.ok(!span, 'only publish operation creates spans')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .listTopics().promise()

      // Handle promise's fulfilled/rejected states
      publishTextPromise.then(function (data) {
        agent.endTransaction()
        listener.close()
      }).catch(function (err) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: ignored queue', function (t) {
    const params = {
      Message: 'this is my test, there are many like it but this one is mine', /* required */
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:ignore-name'
    }

    const app = createMockServer(
      fixtures.publish
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'messaging').pop()
        t.ok(!span, 'ignores configured topic name')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params).promise()

      // Handle promise's fulfilled/rejected states
      publishTextPromise.then(function (data) {
        agent.endTransaction()
        listener.close()
      }).catch(function (err) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.end()
})
