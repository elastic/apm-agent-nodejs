/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const async_hooks = require('async_hooks');
const semver = require('semver');

// A polyfilled `AsyncResource.bind` that behaves like Node.js v17.8.0.
// https://nodejs.org/api/async_context.html#asyncresourcebindfn-thisarg
// Adapted from dd-trace and
// https://github.com/nodejs/node/blob/v17.8.0/lib/async_hooks.js#L227-L260
let AsyncResource;
if (semver.satisfies(process.versions.node, '>=17.8.0')) {
  AsyncResource = async_hooks.AsyncResource;
} else {
  AsyncResource = class extends async_hooks.AsyncResource {
    static bind(fn, type, thisArg) {
      type = type || fn.name;
      return new AsyncResource(type || 'bound-anonymous-fn').bind(fn, thisArg);
    }

    bind(fn, thisArg) {
      let bound;
      if (thisArg === undefined) {
        const resource = this;
        bound = function (...args) {
          args.unshift(fn, this);
          return Reflect.apply(resource.runInAsyncScope, resource, args);
        };
      } else {
        bound = this.runInAsyncScope.bind(this, fn, thisArg);
      }
      Object.defineProperties(bound, {
        length: {
          configurable: true,
          enumerable: false,
          value: fn.length,
          writable: false,
        },
        asyncResource: {
          configurable: true,
          enumerable: true,
          value: this,
          writable: true,
        },
      });
      return bound;
    }
  };
}

module.exports = {
  AsyncResource,
};
