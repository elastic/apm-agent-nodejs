/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// See "lib/instrumentation/modules/next/README.md".

const semver = require('semver');

const shimmer = require('../../../../../shimmer');

// `kSetTransNameFn` symbol is shared with "next-server.js" instrumentation.
const kSetTransNameFn = Symbol.for('ElasticAPMNextJsSetTransNameFn');

const noopFn = () => {};

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod;
  }
  if (
    !semver.satisfies(version, '>=11.1.0 <14.0.0', { includePrerelease: true })
  ) {
    agent.logger.debug('next version %s not supported, skipping', version);
    return mod;
  }

  const ins = agent._instrumentation;
  const log = agent.logger;

  const DevServer = mod.default;
  shimmer.wrap(DevServer.prototype, 'generateRoutes', wrapGenerateRoutes);
  shimmer.wrap(
    DevServer.prototype,
    'findPageComponents',
    wrapFindPageComponents,
  );
  if (semver.satisfies(version, '11.x')) {
    // See comment for `wrapEnsureApiPage` in "../next-server.js".
    shimmer.wrap(DevServer.prototype, 'ensureApiPage', wrapEnsureApiPage);
  }
  // Instrumenting the DevServer also uses the wrapping of
  // 'NextNodeServer.renderErrorToResponse' in "next-server.js".

  return mod;

  // The `route` objects being wrapped here have this type:
  // https://github.com/vercel/next.js/blob/v12.3.0/packages/next/server/router.ts#L26-L45
  function wrapGenerateRoutes(orig) {
    return function wrappedGenerateRoutes() {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments);
      }
      const routes = orig.apply(this, arguments);
      log.debug('wrap Next.js DevServer routes');
      routes.redirects.forEach(wrapRedirectRoute);
      routes.rewrites.beforeFiles.forEach(wrapRewriteRoute);
      routes.rewrites.afterFiles.forEach(wrapRewriteRoute);
      routes.rewrites.fallback.forEach(wrapRewriteRoute);
      routes.fsRoutes.forEach(wrapFsRoute);
      wrapCatchAllRoute(routes.catchAllRoute);
      return routes;
    };
  }

  function wrapRedirectRoute(route) {
    if (typeof route.fn !== 'function') {
      return;
    }
    const origRouteFn = route.fn;
    route.fn = function () {
      const trans = ins.currTransaction();
      if (trans) {
        trans.setDefaultName('Next.js ' + route.name);
        trans[kSetTransNameFn] = noopFn;
      }
      return origRouteFn.apply(this, arguments);
    };
  }

  function wrapRewriteRoute(route) {
    if (typeof route.fn !== 'function') {
      return;
    }
    const origRouteFn = route.fn;
    route.fn = function () {
      const trans = ins.currTransaction();
      if (trans) {
        trans.setDefaultName(`Next.js ${route.name} -> ${route.destination}`);
        trans[kSetTransNameFn] = noopFn;
      }
      return origRouteFn.apply(this, arguments);
    };
  }

  // "FS" routes are those that go looking for matching paths on the filesystem
  // to fulfill the request.
  function wrapFsRoute(route) {
    if (typeof route.fn !== 'function') {
      return;
    }
    const origRouteFn = route.fn;
    // We explicitly handle only the `fsRoute`s that we know by name in the
    // Next.js code. We cannot set `trans.name` for all of them because of the
    // true catch-all-routes that match any path and only sometimes handle them
    // (e.g. 'public folder catchall').
    switch (route.name) {
      case '_next/data catchall':
        // This handles "/_next/data/..." paths that are used by Next.js
        // client-side code to call `getServerSideProps()` for user pages.
        route.fn = function () {
          const trans = ins.currTransaction();
          if (trans) {
            trans.setDefaultName(`Next.js ${route.name}`);
            if (!trans[kSetTransNameFn]) {
              trans[kSetTransNameFn] = (_req, pathname) => {
                trans.setDefaultName(`Next.js _next/data route ${pathname}`);
                trans[kSetTransNameFn] = noopFn;
              };
            }
          }
          return origRouteFn.apply(this, arguments);
        };
        break;
      case '_next/static/development/_devMiddlewareManifest.json':
      case '_next/static/development/_devPagesManifest.json':
      case '_next/development catchall':
      case '_next/static catchall':
      case '_next/image catchall':
      case '_next catchall':
        route.fn = function () {
          const trans = ins.currTransaction();
          if (trans) {
            trans.setDefaultName(`Next.js ${route.name}`);
          }
          return origRouteFn.apply(this, arguments);
        };
        break;
    }
  }

  function wrapCatchAllRoute(route) {
    if (typeof route.fn !== 'function') {
      return;
    }
    const origRouteFn = route.fn;
    route.fn = function () {
      const trans = ins.currTransaction();
      // This is a catchall route, so only set a kSetTransNameFn if a more
      // specific route wrapper hasn't already done so.
      if (trans && !trans[kSetTransNameFn]) {
        trans[kSetTransNameFn] = (req, pathname) => {
          trans.setDefaultName(`${req.method} ${pathname}`);
          // Ensure only the first `findPageComponents` result sets the trans
          // name, otherwise a loaded `/_error` for page error handling could
          // incorrectly override.
          trans[kSetTransNameFn] = noopFn;
        };
      }
      return origRouteFn.apply(this, arguments);
    };
  }

  // Only used with next@11.
  function wrapEnsureApiPage(orig) {
    return function wrappedEnsureApiPage(pathname) {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments);
      }
      const trans = ins.currTransaction();
      if (trans && trans.req) {
        log.trace({ pathname }, 'set transaction name from ensureApiPage');
        trans.setDefaultName(`${trans.req.method} ${pathname}`);
        trans[kSetTransNameFn] = noopFn;
      }
      return orig.apply(this, arguments);
    };
  }

  // `findPageComponents` is used to load any "./pages/..." files. It provides
  // the resolved path appropriate for the transaction name.
  function wrapFindPageComponents(orig) {
    return function wrappedFindPageComponents(pathnameOrArgs) {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments);
      }

      // In next <=12.2.6-canary.10 the function signature is:
      //    async findPageComponents(pathname, query, params, isAppPath)
      // after that version it is:
      //    async findPageComponents({ pathname, query, params, isAppPath })
      const pathname =
        typeof pathnameOrArgs === 'string'
          ? pathnameOrArgs
          : pathnameOrArgs.pathname;

      const promise = orig.apply(this, arguments);
      promise.then((findComponentsResult) => {
        if (findComponentsResult) {
          const trans = ins.currTransaction();
          if (trans && trans.req && trans[kSetTransNameFn]) {
            log.trace(
              { pathname },
              'set transaction name from findPageComponents',
            );
            trans[kSetTransNameFn](trans.req, pathname);
          }
        }
      });
      return promise;
    };
  }
};
