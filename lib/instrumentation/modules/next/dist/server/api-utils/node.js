/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// See "lib/instrumentation/modules/next/README.md".

const semver = require('semver');

const shimmer = require('../../../../../shimmer');

const kErrIsCaptured = Symbol.for('ElasticAPMNextJsErrIsCaptured');

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod;
  }
  if (
    !semver.satisfies(version, '>=11.1.0 <14.0.0', { includePrerelease: true })
  ) {
    agent.logger.debug(
      'next/dist/server/api-utils/node.js version %s not supported, skipping',
      version,
    );
    return mod;
  }

  const wrappedModFromMod = new WeakMap();

  shimmer.wrap(mod, 'apiResolver', wrapApiResolver);

  return mod;

  function wrapApiResolver(orig) {
    return function wrappedApiResolver(
      _req,
      _res,
      _query,
      resolverModule,
      _apiContext,
      _propagateError,
      _dev,
      _page,
    ) {
      // The user module that we are wrapping is a webpack-wrapped build that
      // exposes fields only as getters. We therefore need to fully replace
      // the module to be able to wrap the single `.default` field.
      //
      // Cache `wrappedMod` so we only need to create it once per API endpoint,
      // rather than every time each API endpoint is called.
      let wrappedMod = wrappedModFromMod.get(resolverModule);
      if (!wrappedMod) {
        wrappedMod = {};
        const names = Object.getOwnPropertyNames(resolverModule);
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          if (name !== 'default') {
            // Proxy other module fields.
            Object.defineProperty(wrappedMod, name, {
              enumerable: true,
              get: function () {
                return resolverModule[name];
              },
            });
          }
        }
        wrappedMod.default = wrapApiHandler(
          resolverModule.default || resolverModule,
        );
        wrappedModFromMod.set(resolverModule, wrappedMod);
      }
      arguments[3] = wrappedMod;

      return orig.apply(this, arguments);
    };
  }

  function wrapApiHandler(orig) {
    // This wraps a user's API handler in order to capture an error if there
    // is one. For example:
    //    // pages/api/some-endpoint-path.js
    //    export default function handler(req, res) {
    //      // ...
    //      throw new Error('boom')
    //    }
    // That handler might also be async, in which case it returns a promise
    // that we want to watch for a possible rejection.
    return function wrappedApiHandler() {
      let promise;
      try {
        promise = orig.apply(this, arguments);
      } catch (syncErr) {
        agent.captureError(syncErr);
        syncErr[kErrIsCaptured] = true;
        throw syncErr;
      }
      if (promise) {
        promise.catch((rejectErr) => {
          agent.captureError(rejectErr);
          rejectErr[kErrIsCaptured] = true;
        });
      }
      return promise;
    };
  }
};
