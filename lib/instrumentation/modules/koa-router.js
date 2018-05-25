'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

module.exports = function (Router, agent, version, enabled) {
  if (!enabled) return Router
  if (!semver.satisfies(version, '>=5.2.0 <8')) {
    agent.logger.debug('koa-router version %s not supported - aborting...', version)
    return Router
  }

  agent.logger.debug('shimming koa-router prototype.match function')
  shimmer.wrap(Router.prototype, 'match', function (orig) {
    return function (_, method) {
      var matched = orig.apply(this, arguments)

      if (typeof method !== 'string') {
        agent.logger.debug('unexpected method type in koa-router prototype.match: %s', typeof method)
        return matched
      }

      if (matched && matched.pathAndMethod && matched.pathAndMethod.length) {
        var match = matched.pathAndMethod[matched.pathAndMethod.length - 1]
        var path = match && match.path
        if (typeof path === 'string') {
          var name = method + ' ' + path
          agent._instrumentation.setDefaultTransactionName(name)
        } else {
          agent.logger.debug('unexpected path type in koa-router prototype.match: %s', typeof path)
        }
      } else {
        agent.logger.debug('unexpected match result in koa-router prototype.match: %s', typeof matched)
      }

      return matched
    }
  })

  return Router
}
