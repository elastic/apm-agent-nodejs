/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { AsyncResource } = require('../../../../../async-hooks-polyfill');

const semver = require('semver');

module.exports = (mod, agent, { version, enabled }) => {
  if (!enabled) return mod;
  if (!semver.satisfies(version, '>=3.3 <7.0')) {
    agent.logger.debug(
      'mongodb version %s not instrumented (mongodb <3.3 is instrumented via mongodb-core)',
      version,
    );
    return mod;
  }

  if (mod.ConnectionPool) {
    class ConnectionPoolTraced extends mod.ConnectionPool {
      checkOut(callback) {
        return super.checkOut(AsyncResource.bind(callback));
      }
    }

    Object.defineProperty(mod, 'ConnectionPool', {
      enumerable: true,
      get: function () {
        return ConnectionPoolTraced;
      },
    });

    return mod;
  }
};
