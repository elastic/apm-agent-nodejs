/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const agent = require('../../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

const test = require('tape')
const http = require('http')
const semver = require('semver')
const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const mockClient = require('../../../_mock_http_client')

const APOLLO_PORT = 4000

if (semver.lt(process.version, '14.16.0')) {
  console.log(`# SKIP @apollo/server does not officially support node ${process.version} (14.16.0 or later required)`)
  process.exit()
}

function initialiseHelloWorldServer (t) {
  const typeDefs = `#graphql
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

  const server = new ApolloServer({ typeDefs, resolvers })
  return startStandaloneServer(server, { listen: { port: APOLLO_PORT } }).then(() => server)
}

function requestOpts (method, query = '') {
  return {
    method,
    port: APOLLO_PORT,
    path: `/graphql?${query}`,
    headers: { 'Content-Type': 'application/json' }
  }
}

function parseResponse (res) {
  return new Promise(resolve => {
    const chunks = []
    res.on('data', chunks.push.bind(chunks))
    res.on('end', function () {
      const result = Buffer.concat(chunks).toString()
      resolve(result)
    })
  })
}

test('POST /graphql', function (t) {
  resetAgent(done(t, 'hello'))
  initialiseHelloWorldServer(t).then((server) => {
    const req = http.request(requestOpts('POST'), function (res) {
      parseResponse(res).then(result => {
        server.stop()
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n',
          'client got the expected response body')
        agent.flush()
      })
    })
    req.end('{"query":"{ hello }"}')
  })
})

test('GET /graphql', function (t) {
  resetAgent(done(t, 'hello'))
  initialiseHelloWorldServer(t).then((server) => {
    const query = 'query=query+%7B%0D%0A++hello%0D%0A%7D%0D%0A'
    const req = http.request(requestOpts('GET', query), function (res) {
      parseResponse(res).then(result => {
        server.stop()
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n',
          'client got the expected response body')
        agent.flush()
      })
    })
    req.end()
  })
})

test('POST /graphql - named query', function (t) {
  resetAgent(done(t, 'HelloQuery hello'))
  const query = '{"query":"query HelloQuery { hello }"}'
  initialiseHelloWorldServer(t).then((server) => {
    const req = http.request(requestOpts('POST'), function (res) {
      parseResponse(res).then(result => {
        server.stop()
        t.strictEqual(result, '{"data":{"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

test('POST /graphql - sort multiple queries', function (t) {
  resetAgent(done(t, 'hello, life'))
  const typeDefs = `#graphql
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

  const server = new ApolloServer({ typeDefs, resolvers })
  startStandaloneServer(server, { listen: { port: APOLLO_PORT } }).then(() => {
    const req = http.request(requestOpts('POST'), function (res) {
      parseResponse(res).then(result => {
        server.stop()
        t.strictEqual(result, '{"data":{"life":42,"hello":"Hello world!"}}\n')
        agent.flush()
      })
    })
    req.end(query)
  })
})

test('POST /graphql - sub-query', function (t) {
  resetAgent(done(t, 'books'))
  const query = '{"query":"{ books { title author, publisher { name } } }"}'
  const books = [
    {
      title: 'Mikael Hakim',
      author: 'Mika Waltari',
      publisher: { name: 'WSOY' }
    },
    {
      title: 'The Life and Times of Scrooge McDuck',
      author: 'Don Rosa',
      publisher: { name: 'Egmont' }
    }
  ]

  const typeDefs = `#graphql
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

  const server = new ApolloServer({ typeDefs, resolvers })
  startStandaloneServer(server, { listen: { port: APOLLO_PORT } }).then(() => {
    const req = http.request(requestOpts('POST'), function (res) {
      parseResponse(res).then(result => {
        server.stop()
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
  agent._instrumentation.testReset()
  // Cannot use the 'expected' argument to mockClient, because the way the
  // tests above are structured, there is a race between the mockClient
  // receiving events from the APM agent and the graphql request receiving a
  // response. Using the 200ms delay in mockClient slows things down such that
  // "done" should always come last.
  agent._transport = mockClient(cb)
  agent.captureError = function (err) { throw err }
}
