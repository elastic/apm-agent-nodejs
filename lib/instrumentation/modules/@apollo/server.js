/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const shimmer = require('../../shimmer')

module.exports = function (apolloServerCore, agent, { enabled }) {
  if (!enabled) return apolloServerCore

  function wrapGraphQLRequest (orig) {
    return function wrappedRunHttpQuery () {
      var trans = agent._instrumentation.currTransaction()
      if (trans) trans._graphqlRoute = true
      return orig.apply(this, arguments)
    }
  }

  shimmer.wrap(apolloServerCore.ApolloServer.prototype, 'executeHTTPGraphQLRequest', wrapGraphQLRequest)
  return apolloServerCore
}
