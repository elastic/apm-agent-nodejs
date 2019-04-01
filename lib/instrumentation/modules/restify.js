'use strict'

const semver = require('semver')

const shimmer = require('../shimmer')

module.exports = function (restify, agent, { version, enabled }) {
  if (!enabled) return restify

  agent.setFramework({ name: 'restify', version, overwrite: false })

  function patchServer (server) {
    if (semver.gte(version, '7.0.0')) {
      shimmer.wrap(server, '_onHandlerError', function (orig) {
        return function _wrappedOnHandlerError (err, req, res, isUncaught) {
          if (err) agent.captureError(err, { request: req, handled: !isUncaught })
          return orig.apply(this, arguments)
        }
      })
    } else {
      shimmer.wrap(server, '_emitErrorEvents', function (orig) {
        return function _wrappedOnHandlerError (req, res, route, err, cb) {
          if (err) agent.captureError(err, { request: req })
          return orig.apply(this, arguments)
        }
      })
    }
  }

  shimmer.wrap(restify, 'createServer', function (fn) {
    return function wrappedCreateServer () {
      const server = fn.apply(this, arguments)
      patchServer(server)
      return server
    }
  })

  return restify
}
