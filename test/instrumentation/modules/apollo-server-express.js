'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var test = require('tape')

var http = require('http')
var express = require('express')
var querystring = require('querystring')

var ApolloServer = require('apollo-server-express').ApolloServer
var gql = require('apollo-server-express').gql

var mockClient = require('../../_mock_http_client')

test('POST /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  var typeDefs = gql`
    type Query {
      hello: String
    }
  `
  var resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  var query = '{"query":"{ hello }"}'

  var app = express()
  var apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.applyMiddleware({ app })
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: { 'Content-Type': 'application/json' }
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

test('GET /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  var typeDefs = gql`
    type Query {
      hello: String
    }
  `
  var resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  var query = querystring.stringify({ query: '{ hello }' })

  var app = express()
  var apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.applyMiddleware({ app })
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
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end()
  })
})

test('POST /graphql - named query', function (t) {
  resetAgent(done(t, 'HelloQuery hello'))

  var typeDefs = gql`
    type Query {
      hello: String
    }
  `
  var resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  var query = '{"query":"query HelloQuery { hello }"}'

  var app = express()
  var apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.applyMiddleware({ app })
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: { 'Content-Type': 'application/json' }
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

test('POST /graphql - sort multiple queries', function (t) {
  resetAgent(done(t, 'hello, life'))

  var typeDefs = gql`
    type Query {
      hello: String
      life: Int
    }
  `
  var resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return 'Hello world!'
      },
      life () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return 42
      }
    }
  }
  var query = '{"query":"{ life, hello }"}'

  var app = express()
  var apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.applyMiddleware({ app })
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: { 'Content-Type': 'application/json' }
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.strictEqual(result, '{"data":{"life":42,"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

test('POST /graphql - sub-query', function (t) {
  resetAgent(done(t, 'books'))

  var books = [
    {
      title: 'Harry Potter and the Chamber of Secrets',
      author: 'J.K. Rowling',
      publisher: { name: 'ACME' }
    },
    {
      title: 'Jurassic Park',
      author: 'Michael Crichton',
      publisher: { name: 'ACME' }
    }
  ]
  var typeDefs = gql`
    type Publisher {
      name: String
    }
    type Book {
      title: String
      author: String
      publisher: Publisher
    }
    type Query {
      books: [Book]
    }
  `
  var resolvers = {
    Query: {
      books () {
        t.ok(agent._instrumentation.currentTransaction, 'have active transaction')
        return books
      }
    }
  }
  var query = '{"query":"{ books { title author, publisher { name } } }"}'

  var app = express()
  var apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.applyMiddleware({ app })
  var server = app.listen(function () {
    var port = server.address().port
    var opts = {
      method: 'POST',
      port: port,
      path: '/graphql',
      headers: { 'Content-Type': 'application/json' }
    }
    var req = http.request(opts, function (res) {
      var chunks = []
      res.on('data', chunks.push.bind(chunks))
      res.on('end', function () {
        server.close()
        var result = Buffer.concat(chunks).toString()
        t.strictEqual(result, JSON.stringify({ data: { books } }) + '\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

function done (t, query) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    var trans = data.transactions[0]
    var span = data.spans[0]

    t.strictEqual(trans.name, query + ' (/graphql)')
    t.strictEqual(trans.type, 'graphql')
    t.strictEqual(span.name, 'GraphQL: ' + query)
    t.strictEqual(span.type, 'db')
    t.strictEqual(span.subtype, 'graphql')
    t.strictEqual(span.action, 'execute')

    var offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(2, cb)
  agent.captureError = function (err) { throw err }
}
