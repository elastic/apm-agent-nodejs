'use strict'

const semver = require('semver')
const shimmer = require('../shimmer')

module.exports = function (apolloServerCore, agent, version, enabled) {
  if (!enabled) return apolloServerCore

  if (!semver.satisfies(version, '^2.0.2')) {
    agent.logger.debug('apollo-server-core version %s not supported - aborting...', version)
    return apolloServerCore
  }

  shimmer.wrap(apolloServerCore, 'runHttpQuery', function (runHttpQuery) {
    return function wrappedRunHttpQuery () {
      var trans = agent._instrumentation.currentTransaction
      if (trans) trans._graphqlRoute = true
      return runHttpQuery.apply(this, arguments)
    }
  })

  return apolloServerCore
}
