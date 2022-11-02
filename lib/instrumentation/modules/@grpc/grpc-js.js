/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

var shimmer = require('../../shimmer')

module.exports = function (grpc, agent, { version, enabled }) {
  if (!enabled) {
    return grpc
  }
  shimmer.wrap(grpc.Server.prototype, 'register', function wrapServerRegister (orig) {
    return function wrappedRegistered (name, handler) {
      arguments[1] = shimmer.wrapFunction(handler, function wrapHandler(origHandler) {
        return function wrappedHandler() {
          console.log('start wrapped grpc handler')
          // why no transaction
          console.log(agent._instrumentation.currTransation())
          console.log('end wrapped grpc handler')
          return origHandler.apply(this, arguments)
        }
      })
      return orig.apply(this, arguments)
    }
  })
  return grpc
}
