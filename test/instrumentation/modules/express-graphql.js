'use strict'

var agent = require('../../..').start({
  appName: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})

if (require('semver').lt(process.version, '1.0.0')) process.exit()

var test = require('tape')
var http = require('http')
var querystring = require('querystring')
var express = require('express')
var graphqlHTTP = require('express-graphql')
var buildSchema = require('graphql').buildSchema

test('POST /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  var schema = buildSchema('type Query { hello: String }')
  var root = {hello: function () {
    t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
    return 'Hello world!'
  }}
  var query = '{"query":"{ hello }"}'

  var app = express()
  app.use('/graphql', graphqlHTTP({schema: schema, rootValue: root}))
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: {'Content-Type': 'application/json'}
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.equal(result, '{"data":{"hello":"Hello world!"}}')
        agent._instrumentation._queue._flush()
      })
    })
    req.end(query)
  })
})

test('GET /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  var schema = buildSchema('type Query { hello: String }')
  var root = {hello: function () {
    t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
    return 'Hello world!'
  }}
  var query = querystring.stringify({query: '{ hello }'})

  var app = express()
  app.use('/graphql', graphqlHTTP({schema: schema, rootValue: root}))
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'GET',
      port: port,
      path: '/graphql?' + query
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.equal(result, '{"data":{"hello":"Hello world!"}}')
        agent._instrumentation._queue._flush()
      })
    })
    req.end()
  })
})

test('POST /graphql - sort multiple queries', function (t) {
  resetAgent(done(t, 'hello, life'))

  var schema = buildSchema('type Query { hello: String, life: Int }')
  var root = {
    hello: function () {
      t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
      return 'Hello world!'
    },
    life: function () {
      t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
      return 42
    }
  }
  var query = '{"query":"{ life, hello }"}'

  var app = express()
  app.use('/graphql', graphqlHTTP({schema: schema, rootValue: root}))
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: {'Content-Type': 'application/json'}
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.equal(result, '{"data":{"life":42,"hello":"Hello world!"}}')
        agent._instrumentation._queue._flush()
      })
    })
    req.end(query)
  })
})

// { transactions:
//    [ { transaction: 'hello (/graphql)',
//        result: 200,
//        kind: 'request',
//        timestamp: '2017-01-30T19:48:00.000Z',
//        durations: [ 56.084992 ] } ],
//   traces:
//    { groups:
//       [ { transaction: 'hello (/graphql)',
//           signature: 'GraphQL: hello',
//           kind: 'db.graphql.execute',
//           transaction_kind: 'request',
//           timestamp: '2017-01-30T19:48:00.000Z',
//           parents: [ 'transaction' ],
//           extra: { _frames: [Object] } },
//         { transaction: 'hello (/graphql)',
//           signature: 'transaction',
//           kind: 'transaction',
//           transaction_kind: 'request',
//           timestamp: '2017-01-30T19:48:00.000Z',
//           parents: [],
//           extra: { _frames: [Object] } } ],
//      raw:
//       [ [ 56.084992,
//           [ 0, 47.968938, 3.236816 ],
//           [ 1, 0, 56.084992 ],
//           { extra: [Object], http: [Object], user: {} } ] ] } }
function done (t, query) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    t.equal(data.transactions[0].transaction, query + ' (/graphql)')
    t.equal(data.transactions[0].kind, 'request')

    t.equal(data.traces.groups.length, 2)

    t.equal(data.traces.groups[0].kind, 'db.graphql.execute')
    t.equal(data.traces.groups[0].transaction_kind, 'request')
    t.deepEqual(data.traces.groups[0].parents, ['transaction'])
    t.equal(data.traces.groups[0].signature, 'GraphQL: ' + query)
    t.equal(data.traces.groups[0].transaction, query + ' (/graphql)')

    t.equal(data.traces.groups[1].kind, 'transaction')
    t.equal(data.traces.groups[1].transaction_kind, 'request')
    t.deepEqual(data.traces.groups[1].parents, [])
    t.equal(data.traces.groups[1].signature, 'transaction')
    t.equal(data.traces.groups[1].transaction, query + ' (/graphql)')

    var totalTraces = data.traces.raw[0].length - 2
    var totalTime = data.traces.raw[0][0]

    t.equal(data.traces.raw.length, 1)
    t.equal(totalTraces, 2)

    for (var i = 1; i < totalTraces + 1; i++) {
      t.equal(data.traces.raw[0][i].length, 3)
      t.ok(data.traces.raw[0][i][0] >= 0, 'group index should be >= 0')
      t.ok(data.traces.raw[0][i][0] < data.traces.groups.length, 'group index should be within allowed range')
      t.ok(data.traces.raw[0][i][1] >= 0)
      t.ok(data.traces.raw[0][i][2] <= totalTime)
    }

    t.equal(data.traces.raw[0][totalTraces][1], 0, 'root trace should start at 0')
    t.equal(data.traces.raw[0][totalTraces][2], data.traces.raw[0][0], 'root trace should last to total time')

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
