'use strict'

const semver = require('semver')

module.exports = function (fastify, agent, { version, enabled }) {
  if (!enabled) return fastify

  agent.setFramework({ name: 'fastify', version, overwrite: false })

  agent.logger.debug('wrapping fastify build function')

  return semver.gte(version, '2.0.0-rc') ? wrappedBuild2Plus : wrappedBuildPre2

  function wrappedBuild2Plus () {
    const _fastify = fastify.apply(null, arguments)

    agent.logger.debug('adding onRequest hook to fastify')
    _fastify.addHook('onRequest', (req, reply, next) => {
      const context = reply.context
      const name = req.raw.method + ' ' + context.config.url
      agent._instrumentation.setDefaultTransactionName(name)
      next()
    })

    agent.logger.debug('adding onError hook to fastify')
    _fastify.addHook('onError', (req, reply, err, next) => {
      agent.captureError(err, { request: req.raw })
      next()
    })

    return _fastify
  }

  function wrappedBuildPre2 () {
    const _fastify = fastify.apply(null, arguments)

    agent.logger.debug('adding onRequest hook to fastify')
    _fastify.addHook('onRequest', (req, reply, next) => {
      const context = reply._context
      const name = req.method + ' ' + context.config.url
      agent._instrumentation.setDefaultTransactionName(name)
      next()
    })

    agent.logger.warn('Elastic APM cannot automaticaly capture errors on this verison of Fastify. Upgrade to version 2.0.0 or later.')

    return _fastify
  }
}
