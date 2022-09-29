/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// XXX comment this module is solely about capturing possible error in a user's API handler.
//     It is admittedly a lot of code for just that.

const semver = require('semver')

const shimmer = require('../../../../../shimmer')

module.exports = function (mod, agent, { version, enabled }) {
  console.log('XXX enabled: ', enabled)
  console.log('XXX version: ', version)
  if (!enabled) {
    return mod
  }
  if (!semver.satisfies(version, '>=11.1.0 <13.0.0')) {
    agent.logger.debug('next/dist/server/api-utils/node.js version %s not supported, skipping', version)
    return mod
  }

  shimmer.wrap(mod, 'apiResolver', wrapApiResolver)

  return mod

  function wrapApiResolver (orig) {
    return function wrappedApiResolver (req, res, query, resolverModule, apiContext, propagateError, dev, page) {
      // XXX This is iteration and creating a wrapper object for every invocation. Yuck.
      //    Need to cache this. WeakRef on resolverModule?
      // XXX I haven't yet tested the case where `resolverModule` doesn't have a
      //    `.default`, but *is* the handler function. What cases can that happen?

      // The user module that we are wrapping is a webpack-wrapped build that
      // exposes fields only as getters. We therefore need to fully replace
      // the module to be able to wrap the single `.default` field.
      // XXX can we use lib/propwrap.js?!
      const wrappedMod = {}
      const names = Object.getOwnPropertyNames(resolverModule)
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        if (name !== 'default') {
          // Proxy other module fields.
          Object.defineProperty(wrappedMod, name, { enumerable: true, get: function () { return resolverModule[name] } })
        }
      }
      wrappedMod.default = wrapApiHandler(resolverModule.default || resolverModule)
      arguments[3] = wrappedMod

      return orig.apply(this, arguments)
    }
  }

  function wrapApiHandler (orig) {
    // This wraps a user's API handler in order to capture an error if there
    // is one. For example:
    //    // pages/api/some-endpoint-path.js
    //    export default function handler(req, res) {
    //      // ...
    //      throw new Error('boom')
    //    }
    // That handler might also be async, in which case it returns a promise
    // that we want to watch for a possible rejection.
    return function wrappedApiHandler () {
      let promise
      try {
        promise = orig.apply(this, arguments)
      } catch (syncErr) {
        agent.captureError(syncErr)
        throw syncErr
      }
      if (promise) {
        promise.catch(rejectErr => {
          agent.captureError(rejectErr)
        })
      }
      return promise
    }
  }
}
