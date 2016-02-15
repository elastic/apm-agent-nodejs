'use strict'

var shimmer = require('shimmer')
var semver = require('semver')
var debug = require('debug')('opbeat')

module.exports = function (hapi, agent, version) {
  if (!semver.satisfies(version, '>=9.0.0')) {
    debug('hapi version %s not suppoted - aborting...', version)
    return hapi
  }

  debug('shimming hapi.Server.prototype.initialize')

  shimmer.wrap(hapi.Server.prototype, 'initialize', function (orig) {
    return function () {
      if (typeof this.ext === 'function') {
        this.ext('onPreResponse', function (request, reply) {
          debug('received Hapi onPreResponse event')

          if (request.route) {
            var fingerprint = request.route.fingerprint || request.route.path
            if (fingerprint) {
              var name = (request.raw && request.raw.req && request.raw.req.method) ||
                         (request.route.method && request.route.method.toUpperCase())
              if (typeof name === 'string') name = name + ' ' + fingerprint
              else name = fingerprint
              agent._instrumentation.setDefaultTransactionName(name)
            }
          }

          return reply.continue()
        })
      } else {
        debug('unable to enable Hapi instrumentation')
      }

      return orig.apply(this, arguments)
    }
  })

  return hapi
}
