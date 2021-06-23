  const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})
const tape = require('tape')
const AWS = require('aws-sdk')
const express = require('express')
const bodyParser = require('body-parser')
const fixtures = require('./fixtures-dynamodb')

const mockClient = require('../../../_mock_http_client')

const {
  getRegionFromRequest,
  getPortFromRequest,
  getStatementFromRequest,
  getAddressFromRequest
} =
  require('../../../../lib/instrumentation/modules/aws-sdk/dynamodb')

initializeAwsSdk()

function initializeAwsSdk () {
  // SDk requires a region to be set
  AWS.config.update({ region: 'us-west' })

  // without fake credentials the aws-sdk will attempt to fetch
  // credentials as though it was on an EC2 instance
  process.env.AWS_ACCESS_KEY_ID = 'fake-1'
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-2'
}

function createMockServer (xmlResponse) {
  const app = express()
  app.use(bodyParser.urlencoded({ extended: false }))
  app.post('/', (req, res) => {
    res.setHeader('Content-Type', 'text/xml')
    res.send(xmlResponse)
  })
  return app
}

function getXmlResponse (method) {
  return fixtures[method].response
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
}

function getParams (method, port) {
  const params = fixtures[method].request
  params.QueueUrl = `http://localhost:${port}/1/our-queue`
  return params
}

tape.test('AWS DynamoDB: Unit Test Functions', function (test) {
  test.test('function getRegionFromRequest', function (t) {
    const request = {
      service: {
        config: {
          region: 'us-west-2'
        }
      }
    }
    t.equals(getRegionFromRequest(request), 'us-west-2')
    t.equals(getRegionFromRequest({}), undefined)
    t.equals(getRegionFromRequest({service:null}), null)
    t.equals(getRegionFromRequest({service:{config:null}}), null)
    t.equals(getRegionFromRequest({service:{config:{region:null}}}), null)
    t.equals(getRegionFromRequest(), undefined)
    t.equals(getRegionFromRequest(null), null)
    t.end()
  })

  test.test('function getPortFromRequest', function (t) {
    const request = {
      service: {
        endpoint: {
          port: 443
        }
      }
    }
    t.equals(getPortFromRequest(request), 443)
    t.equals(getPortFromRequest({}), undefined)
    t.equals(getPortFromRequest({service:null}), null)
    t.equals(getPortFromRequest({service:{endpoint:null}}), null)
    t.equals(getPortFromRequest({service:{endpoint:{port:null}}}), null)
    t.equals(getPortFromRequest(), undefined)
    t.equals(getPortFromRequest(null), null)
    t.end()
  })

  test.test('function getStatementFromRequest', function (t) {
    const request = {
      operation: 'query',
      params: {
        KeyConditionExpression: 'foo = :bar'
      }
    }
    t.equals(getStatementFromRequest(request), 'foo = :bar')
    t.equals(getStatementFromRequest({}), undefined)
    t.equals(getStatementFromRequest({operation:null}), undefined)
    t.equals(getStatementFromRequest({operation:'query',params:{}}), undefined)
    t.equals(getStatementFromRequest({operation:'query',params:{KeyConditionExpression:null}}), undefined)
    t.equals(getStatementFromRequest(), undefined)
    t.equals(getStatementFromRequest(null), undefined)
    t.end()
  })

  test.test('function getAddressFromRequest', function (t) {
    const request = {
      service: {
        endpoint: {
          host:'dynamodb.us-west-2.amazonaws.com'
        }
      }
    }
    t.equals(getAddressFromRequest(request), 'dynamodb.us-west-2.amazonaws.com')
    t.equals(getAddressFromRequest({}), undefined)
    t.equals(getAddressFromRequest({service:null}), null)
    t.equals(getAddressFromRequest({service:{endpoint:null}}), null)
    t.equals(getAddressFromRequest({service:{endpoint:{host:null}}}), null)
    t.equals(getAddressFromRequest(), undefined)
    t.equals(getAddressFromRequest(null), null)
    t.end()
  })
})

tape.test('AWS DynamoDB: End to End Test', function (test) {
  test.test('API: query', function (t) {
    const app = createMockServer(
      getXmlResponse('query')
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        // const [spanSqs, spanHttp] = getSqsAndOtherSpanFromData(data, t)

        // t.equals(spanSqs.name, 'SQS SEND to our-queue', 'SQS span named correctly')
        // t.equals(spanSqs.type, 'messaging', 'span type set to messaging')
        // t.equals(spanSqs.subtype, 'sqs', 'span subtype set to sqs')
        // t.equals(spanSqs.action, 'send', 'span action matches API method called')
        // t.equals(spanSqs.context.destination.service.type, 'messaging', 'messaging context set')
        // t.equals(spanSqs.context.message.queue.name, 'our-queue', 'queue name context set')

        // t.equals(spanHttp.type, 'external', 'other span is for HTTP request')
        t.end()
      })
      agent.startTransaction('myTransaction')
      // const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })
      // const params = getParams('query', listener.address().port)
      // sqs.sendMessage(params, function (err, data) {
      //   t.error(err)
      //   agent.endTransaction()
      //   listener.close()
      // })
      agent.endTransaction()
      listener.close()
    })
  })

  // test.test('API: no transaction', function (t) {
  //   t.fail()
  //   // t.end()
  // })
})
