'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var graphql = require('graphql')

test('graphql.graphql', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {hello: function () {
    return 'Hello world!'
  }}
  var query = '{ hello }'

  agent.startTransaction('foo')

  graphql.graphql(schema, query, root).then(function (response) {
    agent.endTransaction()
    t.deepEqual(response, {data: {hello: 'Hello world!'}})
    agent._instrumentation._queue._flush()
  })
})

test('graphql.execute', function (t) {
  resetAgent(done(t))

  var schema = graphql.buildSchema('type Query { hello: String }')
  var root = {hello: function () {
    return 'Hello world!'
  }}
  var query = '{ hello }'
  var source = new graphql.Source(query)
  var documentAST = graphql.parse(source)

  agent.startTransaction('foo')

  graphql.execute(schema, documentAST, root).then(function (response) {
    agent.endTransaction()
    t.deepEqual(response, {data: {hello: 'Hello world!'}})
    agent._instrumentation._queue._flush()
  })
})

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
