/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of a GraphQL server implemented
// using 'apollo-server-express'.
// https://www.apollographql.com/docs/apollo-server/integrations/middleware#apollo-server-express
//
// Usage:
// - Set `ELASTIC_APM_SERVER_URL` and `ELASTIC_APM_SECRET_TOKEN` environment
//   variables to configure a target APM server.
//   (See https://www.elastic.co/guide/en/apm/guide/current/apm-quick-start.html)
//      export ELASTIC_APM_SERVER_URL=...
//      export ELASTIC_APM_SECRET_TOKEN=...
// - Start the small GraphQL server:
//      node examples/trace-apollo-server-express.js
// - Make a GraphQL client request. E.g.:
//      curl -i localhost:3000/graphql -X POST -H content-type:application/json -d'{"query":"query HelloQuery { hello }"}'
//
// In the Elastic APM app you should expect to see a transaction and span
// something like:
//
//     transaction "HelloQuery hello (/graphql)"
//     `- span "GraphQL: HelloQuery hello"

require('../').start({
  serviceName: 'example-trace-apollo-server-express',
  logUncaughtExceptions: true,
});

const http = require('http');
const { ApolloServer, gql } = require('apollo-server-express');
const express = require('express');

const typeDefs = gql`
  type Query {
    "A simple type for getting started!"
    hello: String
  }
`;
const resolvers = {
  Query: {
    hello: () => 'world',
  },
};

async function startServer() {
  const app = express();
  app.set('env', 'production');
  app.get('/ping', (req, res, next) => {
    req.resume();
    res.end('pong');
  });
  const httpServer = http.createServer(app);

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app });

  httpServer.listen(3000, () => {
    console.log(
      `Apollo GraphQL server listening at http://localhost:3000${server.graphqlPath}`,
    );
  });
}

startServer();
