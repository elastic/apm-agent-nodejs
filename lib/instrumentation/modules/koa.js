'use strict'

var semver = require('semver')

module.exports = function (koa, agent, version, enabled) {
  if (!enabled) return koa

  if (!agent._conf.frameworkName) agent._conf.frameworkName = 'koa'
  if (!agent._conf.frameworkVersion) agent._conf.frameworkVersion = version

  if (!semver.satisfies(version, '^2.0.0')) {
    agent.logger.debug('koa version %s not supported - aborting...', version)
  }

  return koa
}
