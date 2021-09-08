'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var graphql = require('graphql')
var pkg = require('graphql/package.json')
var semver = require('semver')
var test = require('tape')

var mockClient = require('../../_mock_http_client')

test('graphql.graphql', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return 'Hello world!'
    }
  }
  var query = '{ hello }'

  agent.startTransaction('foo')

  graphql.graphql(schema, query, root).then(function (response) {
    agent.endTransaction()
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

test('graphql.graphql - invalid query', function (t) {
  resetAgent(done(t, 'Unknown Query'))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return 'Hello world!'
    }
  }
  var query = '{ hello'

  agent.startTransaction('foo')

  graphql.graphql(schema, query, root).then(function (response) {
    agent.endTransaction()
    t.deepEqual(Object.keys(response), ['errors'])
    t.strictEqual(response.errors.length, 1, 'should have one error')
    t.ok(response.errors[0].message.indexOf('Syntax Error') !== -1, 'should return a sytax error')
    agent.flush()
  })
})

test('graphql.graphql - transaction ended', function (t) {
  t.plan(5)

  resetAgent(1, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 0)

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'custom')
  })

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return 'Hello world!'
    }
  }
  var query = '{ hello }'

  agent.startTransaction('foo').end()

  graphql.graphql(schema, query, root).then(function (response) {
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
  })
})

test('graphql.execute', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return Promise.resolve('Hello world!')
    }
  }
  var query = '{ hello }'
  var source = new graphql.Source(query)
  var documentAST = graphql.parse(source)

  agent.startTransaction('foo')

  graphql.execute(schema, documentAST, root).then(function (response) {
    agent.endTransaction()
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

test('graphql.execute - transaction ended', function (t) {
  t.plan(5)

  resetAgent(1, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 0)

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'custom')
  })

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return Promise.resolve('Hello world!')
    }
  }
  var query = '{ hello }'
  var source = new graphql.Source(query)
  var documentAST = graphql.parse(source)

  agent.startTransaction('foo').end()

  graphql.execute(schema, documentAST, root).then(function (response) {
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
  })
})

test('graphql.execute args object', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {
    hello () {
      return Promise.resolve('Hello world!')
    }
  }
  var query = '{ hello }'
  var source = new graphql.Source(query)
  var documentAST = graphql.parse(source)
  var args = {
    schema: schema,
    document: documentAST,
    rootValue: root
  }

  agent.startTransaction('foo')

  graphql.execute(args).then(function (response) {
    agent.endTransaction()
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

if (semver.satisfies(pkg.version, '>=0.12')) {
  test('graphql.execute sync', function (t) {
    resetAgent(done(t))

    var schema = graphql.buildSchema('type Query { hello: String }')
    var root = {
      hello () {
        return 'Hello world!'
      }
    }
    var query = '{ hello }'
    var source = new graphql.Source(query)
    var documentAST = graphql.parse(source)

    agent.startTransaction('foo')

    var response = graphql.execute(schema, documentAST, root)

    agent.endTransaction()
    t.deepLooseEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
}

function done (t, spanNameSuffix) {
  spanNameSuffix = spanNameSuffix || 'hello'

  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    var trans = data.transactions[0]
    var span = data.spans[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'custom')
    t.strictEqual(span.name, 'GraphQL: ' + spanNameSuffix)
    t.strictEqual(span.type, 'db')
    t.strictEqual(span.subtype, 'graphql')
    t.strictEqual(span.action, 'execute')

    var offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (expected, cb) {
  if (typeof executed === 'function') return resetAgent(2, expected)
  agent._instrumentation.testReset()
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
