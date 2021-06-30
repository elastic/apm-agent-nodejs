const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: 'none',
  logLevel: 'off'
})
const tape = require('tape')
const AWS = require('aws-sdk')
const express = require('express')
const bodyParser = require('body-parser')
const fixtures = require('./fixtures/dynamodb')

const mockClient = require('../../../_mock_http_client')

const {
  getRegionFromRequest,
  getPortFromRequest,
  getStatementFromRequest,
  getAddressFromRequest,
  getMethodFromRequest
} =
  require('../../../../lib/instrumentation/modules/aws-sdk/dynamodb')

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
    res.setHeader('Content-Type', 'application/javascript')
    res.send(fixture.response)
  })
  return app
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(cb)
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
    t.equals(getRegionFromRequest({ service: null }), null)
    t.equals(getRegionFromRequest({ service: { config: null } }), null)
    t.equals(getRegionFromRequest({ service: { config: { region: null } } }), null)
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
    t.equals(getPortFromRequest({ service: null }), null)
    t.equals(getPortFromRequest({ service: { endpoint: null } }), null)
    t.equals(getPortFromRequest({ service: { endpoint: { port: null } } }), null)
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
    t.equals(getStatementFromRequest({ operation: null }), undefined)
    t.equals(getStatementFromRequest({ operation: 'query', params: {} }), undefined)
    t.equals(getStatementFromRequest({ operation: 'query', params: { KeyConditionExpression: null } }), undefined)
    t.equals(getStatementFromRequest(), undefined)
    t.equals(getStatementFromRequest(null), undefined)
    t.end()
  })

  test.test('function getAddressFromRequest', function (t) {
    const request = {
      service: {
        endpoint: {
          hostname: 'dynamodb.us-west-2.amazonaws.com'
        }
      }
    }
    t.equals(getAddressFromRequest(request), 'dynamodb.us-west-2.amazonaws.com')
    t.equals(getAddressFromRequest({}), undefined)
    t.equals(getAddressFromRequest({ service: null }), null)
    t.equals(getAddressFromRequest({ service: { endpoint: null } }), null)
    t.equals(getAddressFromRequest({ service: { endpoint: { hostname: null } } }), null)
    t.equals(getAddressFromRequest(), undefined)
    t.equals(getAddressFromRequest(null), null)
    t.end()
  })

  test.test('function getMethodFromRequest', function (t) {
    const request = {
      operation: 'query'
    }
    t.equals(getMethodFromRequest(request), 'Query')
    t.equals(getMethodFromRequest({}), undefined)
    t.equals(getMethodFromRequest({ operation: null }), undefined)
    t.equals(getAddressFromRequest(), undefined)
    t.equals(getAddressFromRequest(null), null)

    t.end()
  })
})

tape.test('AWS DynamoDB: End to End Test', function (test) {
  test.test('API: query', function (t) {
    const app = createMockServer(
      fixtures.query
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'db').pop()
        t.equals(span.name, 'DynamoDB Query fixture-table', 'span named correctly')
        t.equals(span.type, 'db', 'span type correctly set')
        t.equals(span.subtype, 'dynamodb', 'span subtype set correctly')
        t.equals(span.action, 'query', 'query set correctly')
        t.equals(span.context.db.statement, 'id = :foo', 'statment set in context correctly')
        t.equals(span.context.destination.service.name, 'dynamodb', 'service name in destination context')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
      var params = {
        TableName: 'fixture-table',
        KeyConditionExpression: 'id = :foo',
        ExpressionAttributeValues: {
          ':foo': { S: '001' }
        }
      }
      ddb.query(params, function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: listTable', function (t) {
    const app = createMockServer(
      fixtures.listTable
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'db').pop()
        t.equals(span.name, 'DynamoDB ListTables', 'span named correctly')
        t.equals(span.type, 'db', 'span type correctly set')
        t.equals(span.subtype, 'dynamodb', 'span subtype set correctly')
        t.equals(span.action, 'query', 'query set correctly')
        t.equals(span.context.destination.service.name, 'dynamodb', 'service name in destination context')

        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
      ddb.listTables(function (err, data) {
        t.error(err)
        agent.endTransaction()
        listener.close()
      })
    })
  })

  test.test('API: error', function (t) {
    const app = createMockServer(
      fixtures.error
    )
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        t.equals(data.errors.length, 1, 'expect captured error')
        const span = data.spans.filter((span) => span.type === 'db').pop()
        t.ok(span, 'expect a db span')
        t.equals(span.outcome, 'failure', 'expect db span to have failure outcome')
        t.end()
      })
      const port = listener.address().port
      AWS.config.update({
        endpoint: `http://localhost:${port}`
      })
      agent.startTransaction('myTransaction')
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
      var params = {
        TableName: 'fixture-table',
        KeyConditionExpression: 'id = :foo',
        ExpressionAttributeValues: {
          ':foo': { S: '001' }
        }
      }
      ddb.query(params, function (err, data) {
        t.ok(err, 'expect error')
        agent.endTransaction()
        listener.close()
      })
    })
  })

  tape.test('AWS DynamoDB: No Transaction', function (test) {
    test.test('API: query', function (t) {
      const app = createMockServer(
        fixtures.query
      )
      const listener = app.listen(0, function () {
        resetAgent(function (data) {
          t.equals(data.spans.length, 0, 'no spans without transaction')
          t.end()
        })
        const port = listener.address().port
        AWS.config.update({
          endpoint: `http://localhost:${port}`
        })
        var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
        var params = {
          TableName: 'fixture-table',
          KeyConditionExpression: 'id = :foo',
          ExpressionAttributeValues: {
            ':foo': { S: '001' }
          }
        }
        ddb.query(params, function (err, data) {
          t.error(err)
          listener.close()
        })
      })
    })
  })
})
