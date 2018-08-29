'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var graphql = require('graphql')
var pkg = require('graphql/package.json')
var semver = require('semver')
var test = require('tape')

test('graphql.graphql', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = { hello () {
    return 'Hello world!'
  } }
  var query = '{ hello }'

  agent.startTransaction('foo')

  graphql.graphql(schema, query, root).then(function (response) {
    agent.endTransaction()
    t.deepEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

test('graphql.execute', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = { hello () {
    return Promise.resolve('Hello world!')
  } }
  var query = '{ hello }'
  var source = new graphql.Source(query)
  var documentAST = graphql.parse(source)

  agent.startTransaction('foo')

  graphql.execute(schema, documentAST, root).then(function (response) {
    agent.endTransaction()
    t.deepEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

test('graphql.execute args object', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = { hello () {
    return Promise.resolve('Hello world!')
  } }
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
    t.deepEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
})

if (semver.satisfies(pkg.version, '>=0.12')) {
  test('graphql.execute sync', function (t) {
    resetAgent(done(t))

    var schema = graphql.buildSchema('type Query { hello: String }')
    var root = { hello () {
      return 'Hello world!'
    } }
    var query = '{ hello }'
    var source = new graphql.Source(query)
    var documentAST = graphql.parse(source)

    agent.startTransaction('foo')

    var response = graphql.execute(schema, documentAST, root)

    agent.endTransaction()
    t.deepEqual(response, { data: { hello: 'Hello world!' } })
    agent.flush()
  })
}

function done (t) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'custom')
    t.equal(trans.spans.length, 1)
    t.equal(trans.spans[0].name, 'GraphQL: hello')
    t.equal(trans.spans[0].type, 'db.graphql.execute')
    t.ok(trans.spans[0].start + trans.spans[0].duration < trans.duration)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
