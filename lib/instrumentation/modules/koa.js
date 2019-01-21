'use strict'

module.exports = function (koa, agent, version, enabled) {
  if (!enabled) return koa

  if (!agent._conf.frameworkName) agent._conf.frameworkName = 'koa'
  if (!agent._conf.frameworkVersion) agent._conf.frameworkVersion = version

  return koa
}
