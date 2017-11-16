'use strict'

/**
 * This file is extracted from the 'async-listener' project copyright by
 * Forrest L Norvell. It have been modified slightly to be used in the current
 * context and where possible changes have been contributed back to the
 * original project.
 *
 * https://github.com/othiym23/async-listener
 *
 * Original file:
 *
 * https://github.com/othiym23/async-listener/blob/master/es6-wrapped-promise.js
 *
 * License:
 *
 * BSD-2-Clause, http://opensource.org/licenses/BSD-2-Clause
 */

module.exports = (Promise, ensureObWrapper) => {
  // Updates to this class should also be applied to the the ES3 version
  // in async-hooks.js
  return class WrappedPromise extends Promise {
    constructor (executor) {
      var context, args
      super(wrappedExecutor)
      var promise = this

      try {
        executor.apply(context, args)
      } catch (err) {
        args[1](err)
      }

      return promise
      function wrappedExecutor (resolve, reject) {
        context = this
        args = [wrappedResolve, wrappedReject]

        // These wrappers create a function that can be passed a function and an argument to
        // call as a continuation from the resolve or reject.
        function wrappedResolve (val) {
          ensureObWrapper(promise, false)
          return resolve(val)
        }

        function wrappedReject (val) {
          ensureObWrapper(promise, false)
          return reject(val)
        }
      }
    }
  }
}
