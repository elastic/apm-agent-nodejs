/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a script using `graphql`.
// Adapted from https://graphql.org/graphql-js/#writing-code

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-graphql'
})
var { graphql, buildSchema } = require('graphql')

// Construct a schema, using GraphQL schema language
var schema = buildSchema(`
  type Query {
    hello: String
    bye: String
  }
`)

// The root provides a resolver function for each API endpoint
var root = {
  hello: () => {
    return 'Hello world!'
  },
  bye: () => {
    return 'Farewell!'
  }
}

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const t1 = apm.startTransaction('t1')

// Run the GraphQL query '{ hello }' and print out the response
graphql(schema, '{ hello }', root).then((response) => {
  console.log('hello response:', response)
})
graphql(schema, '{ bye }', root).then((response) => {
  console.log('bye response:', response)
  t1.end()
})
