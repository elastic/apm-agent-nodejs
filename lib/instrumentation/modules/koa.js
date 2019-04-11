'use strict'

module.exports = function (koa, agent, { version, enabled }) {
  if (!enabled) return koa

  agent.setFramework({ name: 'koa', version, overwrite: false })

  return koa
}
