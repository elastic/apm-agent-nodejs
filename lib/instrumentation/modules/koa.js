'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

module.exports = function (koa, agent, version, enabled) {
  if (!enabled) return koa

  if (!agent._conf.frameworkName) agent._conf.frameworkName = 'koa'
  if (!agent._conf.frameworkVersion) agent._conf.frameworkVersion = version

  if (!semver.satisfies(version, '>=0.1.0')) {
    agent.logger.debug('koa version %s not supported - aborting...', version)
    return koa
  }

  agent.logger.debug('shimming koa prototype.createContext function')
  shimmer.wrap(koa.prototype, 'createContext', function (orig) {
    return function (req, res) {
      var context = orig.apply(this, arguments)

      var method = context.method
      var path = context.path

      if (typeof method !== 'string') {
        agent.logger.debug('unexpected method type in koa prototype.createContext: %s', typeof method)
        return context
      }

      if (typeof path !== 'string') {
        agent.logger.debug('unexpected path type in koa prototype.createContext: %s', typeof path)
        return context
      }

      var name = method + ' ' + path
      agent._instrumentation.setDefaultTransactionName(name)

      return context
    }
  })
  return koa
}
