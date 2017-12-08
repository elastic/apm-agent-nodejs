'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

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

test('POST /graphql - named query', function (t) {
  resetAgent(done(t, 'HelloQuery hello'))

  var schema = buildSchema('type Query { hello: String }')
  var root = {hello: function () {
    t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
    return 'Hello world!'
  }}
  var query = '{"query":"query HelloQuery { hello }"}'

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

function done (t, query) {
  return function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.equal(trans.name, query + ' (/graphql)')
    t.equal(trans.type, 'request')
    t.equal(trans.spans.length, 1)
    t.equal(trans.spans[0].name, 'GraphQL: ' + query)
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
