'use strict'

var semver = require('semver')

module.exports = function (graphqlHTTP, agent, { version, enabled }) {
  if (!enabled) return graphqlHTTP

  if (!semver.satisfies(version, '>=0.6.1 <0.10.0') || typeof graphqlHTTP !== 'function') {
    agent.logger.debug('express-graphql version %s not supported - aborting...', version)
    return graphqlHTTP
  }

  for (const key of Object.keys(graphqlHTTP)) {
    wrappedGraphqlHTTP[key] = graphqlHTTP[key]
  }

  return wrappedGraphqlHTTP

  function wrappedGraphqlHTTP () {
    var orig = graphqlHTTP.apply(this, arguments)

    if (typeof orig !== 'function') return orig

    // Express is very particular with the number of arguments!
    return function (req, res) {
      var trans = agent._instrumentation.currentTransaction
      if (trans) trans._graphqlRoute = true
      return orig.apply(this, arguments)
    }
  }
}
