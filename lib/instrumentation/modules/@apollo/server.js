/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const semver = require('semver');
const shimmer = require('../../shimmer');

module.exports = function (apolloServer, agent, { version, enabled }) {
  if (!enabled) {
    return apolloServer;
  }

  if (!semver.satisfies(version, '^4.0.0')) {
    agent.logger.debug(
      '@apollo/server version %s not supported - aborting...',
      version,
    );
    return apolloServer;
  }

  function wrapExecuteHTTPGraphQLRequest(orig) {
    return function wrappedExecuteHTTPGraphQLRequest() {
      var trans = agent._instrumentation.currTransaction();
      if (trans) trans._graphqlRoute = true;
      return orig.apply(this, arguments);
    };
  }

  shimmer.wrap(
    apolloServer.ApolloServer.prototype,
    'executeHTTPGraphQLRequest',
    wrapExecuteHTTPGraphQLRequest,
  );
  return apolloServer;
};
