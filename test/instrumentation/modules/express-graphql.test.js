/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

// There is a known issue where express-graphql instrumentation does not work
// with express-graphql >=0.10.0 and node <10.4.
// https://github.com/elastic/apm-agent-nodejs/issues/2516
const expressGraphqlVersion = require('../../../node_modules/express-graphql/package.json').version
const semver = require('semver')
if (semver.gte(expressGraphqlVersion, '0.10.0') && semver.lt(process.version, '10.4.0')) {
  console.log(`# SKIP express-graphql@${expressGraphqlVersion} testing with node <10.4 (${process.version}) because of a known issue`)
  process.exit()
}

// graphql@16 crashes with node <12.
const graphqlVer = require('graphql/package.json').version
if (semver.satisfies(graphqlVer, '>=16') && !semver.satisfies(process.version, '>=12')) {
  console.log(`# SKIP graphql@${graphqlVer} is incompatible with node ${process.version}`)
  process.exit()
}

var http = require('http')

var buildSchema = require('graphql').buildSchema
var express = require('express')
var querystring = require('querystring')
var expressGraphql = require('express-graphql')
var test = require('tape')

var mockClient = require('../../_mock_http_client')

const paths = ['/graphql', '/']

// In express-graphql@0.10.0, `graphqlHTTP` changed from being the top export
// to an attribute of the export object.
const graphqlHTTP = expressGraphql.graphqlHTTP || expressGraphql

paths.forEach(function (path) {
  test(`POST ${path}`, function (t) {
    resetAgent(done(t, 'hello', path))

    var schema = buildSchema('type Query { hello: String }')
    var root = {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
    var query = '{"query":"{ hello }"}'

    var app = express()
    app.use(path, graphqlHTTP({ schema: schema, rootValue: root }))
    var server = app.listen(function () {
      var port = server.address().port
      var opts = {
        method: 'POST',
        port: port,
        path,
        headers: { 'Content-Type': 'application/json' }
      }
      var req = http.request(opts, function (res) {
        var chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          var result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}')
          agent.flush()
        })
      })
      req.end(query)
    })
  })

  test(`GET ${path}`, function (t) {
    resetAgent(done(t, 'hello', path))

    var schema = buildSchema('type Query { hello: String }')
    var root = {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
    var query = querystring.stringify({ query: '{ hello }' })

    var app = express()
    app.use(path, graphqlHTTP({ schema: schema, rootValue: root }))
    var server = app.listen(function () {
      var port = server.address().port
      var opts = {
        method: 'GET',
        port: port,
        path: `${path}?${query}`
      }
      var req = http.request(opts, function (res) {
        var chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          var result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}')
          agent.flush()
        })
      })
      req.end()
    })
  })

  test(`POST ${path} - named query`, function (t) {
    resetAgent(done(t, 'HelloQuery hello', path))

    var schema = buildSchema('type Query { hello: String }')
    var root = {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      }
    }
    var query = '{"query":"query HelloQuery { hello }"}'

    var app = express()
    app.use(path, graphqlHTTP({ schema: schema, rootValue: root }))
    var server = app.listen(function () {
      var port = server.address().port
      var opts = {
        method: 'POST',
        port: port,
        path,
        headers: { 'Content-Type': 'application/json' }
      }
      var req = http.request(opts, function (res) {
        var chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          var result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"hello":"Hello world!"}}')
          agent.flush()
        })
      })
      req.end(query)
    })
  })

  test(`POST ${path} - sort multiple queries`, function (t) {
    resetAgent(done(t, 'hello, life', path))

    var schema = buildSchema('type Query { hello: String, life: Int }')
    var root = {
      hello () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 'Hello world!'
      },
      life () {
        t.ok(agent._instrumentation.currTransaction(), 'have active transaction')
        return 42
      }
    }
    var query = '{"query":"{ life, hello }"}'

    var app = express()
    app.use(path, graphqlHTTP({ schema: schema, rootValue: root }))
    var server = app.listen(function () {
      var port = server.address().port
      var opts = {
        method: 'POST',
        port: port,
        path,
        headers: { 'Content-Type': 'application/json' }
      }
      var req = http.request(opts, function (res) {
        var chunks = []
        res.on('data', chunks.push.bind(chunks))
        res.on('end', function () {
          server.close()
          var result = Buffer.concat(chunks).toString()
          t.strictEqual(result, '{"data":{"life":42,"hello":"Hello world!"}}')
          agent.flush()
        })
      })
      req.end(query)
    })
  })
})

function done (t, query, path) {
  return function (data, cb) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    var trans = data.transactions[0]
    var span = data.spans[0]

    t.strictEqual(trans.name, `${query} (${path})`)
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
