/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of 'express-graphql'.
//
// Usage:
// - `node examples/trace-express-graphql.js` to run a small GraphQL server.
// - Make a GraphQL client request. E.g.:
//      curl -i localhost:3000/graphql -X POST -H content-type:application/json -d'{"query":"query HelloQuery { hello }"}'
//
// In the Elastic APM app you should expect to see a transaction and span
// something like:
//
//     transaction "HelloQuery hello (/graphql)"
//     `- span "GraphQL: HelloQuery hello"

require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-express-graphql',
  logUncaughtExceptions: true
})

const graphql = require('graphql')
const express = require('express')
const { graphqlHTTP } = require('express-graphql')

var schema = graphql.buildSchema('type Query { hello: String }')
var root = {
  hello () {
    return 'Hello world!'
  }
}

var app = express()
app.use('/graphql', graphqlHTTP({ schema: schema, rootValue: root }))
app.listen(3000, function () {
  console.warn('listening on http://localhost:3000')
})
