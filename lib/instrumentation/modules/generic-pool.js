'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (generic, opbeat, version) {
  if (!semver.satisfies(version, '^2.0.0')) {
    debug('generic-pool version %s not suppoted - aborting...', version)
    return generic
  }

  debug('shimming generic-pool.Pool')
  shimmer.wrap(generic, 'Pool', function (orig) {
    return function wrappedPool () {
      var trans = opbeat._instrumentation.currentTransaction
      var uuid = trans && trans._uuid
      debug('intercepted call to generic-pool.Pool %o', { uuid: uuid })

      var pool = orig.apply(this, arguments)

      shimmer.wrap(pool, 'acquire', function (orig) {
        return function wrappedAcquire () {
          var trans = opbeat._instrumentation.currentTransaction
          var uuid = trans && trans._uuid
          debug('intercepted call to pool.acquire %o', { uuid: uuid })

          var args = arguments
          var cb = args[0]
          if (typeof cb === 'function') {
            args[0] = opbeat._instrumentation.bindFunction(cb)
          }

          return orig.apply(this, args)
        }
      })

      return pool
    }
  })

  return generic
}
