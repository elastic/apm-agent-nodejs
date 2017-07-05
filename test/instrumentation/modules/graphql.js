'use strict'

var agent = require('../../..').start({
  appName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var semver = require('semver')
if (semver.lt(process.version, '1.0.0')) process.exit()

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

// { transactions:
//    [ { transaction: 'foo',
//        result: undefined,
//        kind: 'custom',
//        timestamp: '2017-01-30T16:15:00.000Z',
//        durations: [ 6.560766 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'foo',
//           signature: 'GraphQL: hello',
//           kind: 'db.graphql.execute',
//           transaction_kind: 'custom',
//           timestamp: '2017-01-30T16:15:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'foo',
//           signature: 'transaction',
//           kind: 'transaction',
//           transaction_kind: 'custom',
//           timestamp: '2017-01-30T16:15:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw:
//       [ [ 6.560766,
//           [ 0, 1.392375, 3.968823 ],
//           [ 1, 0, 6.560766 ],
//           { extra: [Object], user: {} } ] ] } }
function done (t) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    t.equal(data.transactions[0].transaction, 'foo')
    t.equal(data.transactions[0].kind, 'custom')

    t.equal(data.traces.groups.length, 1)

    t.equal(data.traces.groups[0].kind, 'db.graphql.execute')
    t.equal(data.traces.groups[0].transaction_kind, 'custom')
    t.deepEqual(data.traces.groups[0].parents, [])
    t.equal(data.traces.groups[0].signature, 'GraphQL: hello')
    t.equal(data.traces.groups[0].transaction, 'foo')

    var totalTraces = data.traces.raw[0].length - 2
    var totalTime = data.traces.raw[0][0]

    t.equal(data.traces.raw.length, 1)
    t.equal(totalTraces, 1)

    for (var i = 1; i < totalTraces + 1; i++) {
      t.equal(data.traces.raw[0][i].length, 3)
      t.ok(data.traces.raw[0][i][0] >= 0, 'group index should be >= 0')
      t.ok(data.traces.raw[0][i][0] < data.traces.groups.length, 'group index should be within allowed range')
      t.ok(data.traces.raw[0][i][1] >= 0)
      t.ok(data.traces.raw[0][i][2] <= totalTime)
    }

    t.deepEqual(data.transactions[0].durations, [data.traces.raw[0][0]])

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
