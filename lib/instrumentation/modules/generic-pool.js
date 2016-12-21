'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (generic, opbeat, version) {
  if (semver.satisfies(version, '^2.0.0')) {
    debug('shimming generic-pool.Pool')
    shimmer.wrap(generic, 'Pool', function (orig) {
      return function wrappedPool () {
        var trans = opbeat._instrumentation.currentTransaction
        var uuid = trans && trans._uuid
        debug('intercepted call to generic-pool.Pool %o', { uuid: uuid })

        var pool
        if (this instanceof generic.Pool) {
          var args = [].slice.call(arguments)
          args.unshift(null)
          pool = new (Function.prototype.bind.apply(orig, args))()
        } else {
          pool = orig.apply(this, arguments)
        }

        shimmer.wrap(pool, 'acquire', function (orig) {
          return function wrappedAcquire () {
            var trans = opbeat._instrumentation.currentTransaction
            var uuid = trans && trans._uuid
            debug('intercepted call to pool.acquire %o', { uuid: uuid })

            var cb = arguments[0]
            if (typeof cb === 'function') {
              arguments[0] = opbeat._instrumentation.bindFunction(cb)
            }

            return orig.apply(this, arguments)
          }
        })

        return pool
      }
    })
  } else if (semver.satisfies(version, '^3.1.0') && generic.PriorityQueue) {
    // A work-around as an alternative patching the returned promise from the
    // acquire function, we instead patch its resolve and reject functions.
    //
    // We can do that because they are exposed to the PriorityQueue when
    // enqueuing a ResourceRequest:
    //
    // https://github.com/coopernurse/node-pool/blob/58c275c5146977192165f679e86950396be1b9f1/lib/Pool.js#L404
    debug('shimming generic-pool.PriorityQueue.prototype.enqueue')
    shimmer.wrap(generic.PriorityQueue.prototype, 'enqueue', function (orig) {
      return function wrappedEnqueue () {
        var trans = opbeat._instrumentation.currentTransaction
        var uuid = trans && trans._uuid
        debug('intercepted call to generic-pool.PriorityQueue.prototype.enqueue %o', { uuid: uuid })

        var obj = arguments[0]
        // Expect obj to of type Deferred
        if (obj._resolve && obj._reject) {
          obj._resolve = opbeat._instrumentation.bindFunction(obj._resolve)
          obj._reject = opbeat._instrumentation.bindFunction(obj._reject)
        }

        return orig.apply(this, arguments)
      }
    })
  } else {
    debug('generic-pool version %s not suppoted - aborting...', version)
  }

  return generic
}
