/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

const test = require('tape')

const http = require('http')
const express = require('express')
const querystring = require('querystring')
const semver = require('semver')
// require('apollo-server-express') is a hard crash for nodes < 12.0.0
const apolloServerExpressVersion = require('apollo-server-express/package.json').version
if (semver.gte(apolloServerExpressVersion, '3.0.0') && semver.lt(process.version, '12.0.0')) {
  console.log(`# SKIP apollo-server-express@${apolloServerExpressVersion} does not support node ${process.version}`)
  process.exit()
}

const ApolloServer = require('apollo-server-express').ApolloServer
const gql = require('apollo-server-express').gql

const mockClient = require('../../_mock_http_client')

test('POST /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  const typeDefs = gql`
    type Query {
      hello: String
    }
  `
  const resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  const query = '{"query":"{ hello }"}'

  const app = express()
  const apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.start().then(function () {
    apollo.applyMiddleware({ app })
    var server = app.listen(function () {
      const port = server.address().port
      const opts = {
        method: 'POST',
        port: port,
        path: '/graphql',
        headers: { 'Content-Type': 'application/json' }
      }
      const req = http.request(opts, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          const result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n',
            'client got the expected response body')
          agent.flush()
        })
      })
      req.end(query)
    })
  })
})

test('GET /graphql', function (t) {
  resetAgent(done(t, 'hello'))

  const typeDefs = gql`
    type Query {
      hello: String
    }
  `
  const resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  const query = querystring.stringify({ query: '{ hello }' })

  const app = express()
  const apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.start().then(function () {
    apollo.applyMiddleware({ app })
    var server = app.listen(function () {
      const port = server.address().port
      const opts = {
        method: 'GET',
        port: port,
        path: '/graphql?' + query
      }
      const req = http.request(opts, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          const result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n',
            'client got the expected response body')
          agent.flush()
        })
      })
      req.end()
    })
  })
})

test('POST /graphql - named query', function (t) {
  resetAgent(done(t, 'HelloQuery hello'))

  const typeDefs = gql`
    type Query {
      hello: String
    }
  `
  const resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
  }
  const query = '{"query":"query HelloQuery { hello }"}'

  const app = express()
  const apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.start().then(function () {
    apollo.applyMiddleware({ app })
    var server = app.listen(function () {
      const port = server.address().port
      const opts = {
        method: 'POST',
        port: port,
        path: '/graphql',
        headers: { 'Content-Type': 'application/json' }
      }
      const req = http.request(opts, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          const result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n')
          agent.flush()
        })
      })
      req.end(query)
    })
  })
})

test('POST /graphql - sort multiple queries', function (t) {
  resetAgent(done(t, 'hello, life'))

  const typeDefs = gql`
    type Query {
      hello: String
      life: Int
    }
  `
  const resolvers = {
    Query: {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      },
      life () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 42
      }
    }
  }
  const query = '{"query":"{ life, hello }"}'

  const app = express()
  const apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.start().then(function () {
    apollo.applyMiddleware({ app })
    var server = app.listen(function () {
      const port = server.address().port
      const opts = {
        method: 'POST',
        port: port,
        path: '/graphql',
        headers: { 'Content-Type': 'application/json' }
      }
      const req = http.request(opts, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          const result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"life":42,"hello":"Hello world!"}}\n')
          agent.flush()
        })
      })
      req.end(query)
    })
  })
})

test('POST /graphql - sub-query', function (t) {
  resetAgent(done(t, 'books'))

  const books = [
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
  const typeDefs = gql`
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
  const resolvers = {
    Query: {
      books () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return books
      }
    }
  }
  const query = '{"query":"{ books { title author, publisher { name } } }"}'

  const app = express()
  const apollo = new ApolloServer({ typeDefs, resolvers, uploads: false })
  apollo.start().then(function () {
    apollo.applyMiddleware({ app })
    var server = app.listen(function () {
      const port = server.address().port
      const opts = {
        method: 'POST',
        port: port,
        path: '/graphql',
        headers: { 'Content-Type': 'application/json' }
      }
      const req = http.request(opts, function (res) {
        const chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          const result = Buffer.concat(chunks).toString()
          t.strictEqual(result, JSON.stringify({ data: { books } }) + '\n')
          agent.flush()
        })
      })
      req.end(query)
    })
  })
})

function done (t, query) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    const trans = data.transactions[0]
    const span = data.spans[0]

    t.strictEqual(trans.name, query + ' (/graphql)')
    t.strictEqual(trans.type, 'graphql')
    t.strictEqual(span.name, 'GraphQL: ' + query)
    t.strictEqual(span.type, 'db')
    t.strictEqual(span.subtype, 'graphql')
    t.strictEqual(span.action, 'execute')

    const offset = span.timestamp - trans.timestamp
    t.ok(offset + span.duration * 1000 < trans.duration * 1000)

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.testReset()
  // Cannot use the 'expected' argument to mockClient, because the way the
  // tests above are structured, there is a race between the mockClient
  // receiving events from the APM agent and the graphql request receiving a
  // response. Using the 200ms delay in mockClient slows things down such that
  // "done" should always come last.
  agent._apmClient = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
