/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// See "lib/instrumentation/modules/next/README.md".

const semver = require('semver')

const shimmer = require('../../../../../shimmer')

const kInErrorHandling = Symbol.for('nextJsInErrorHandling')
const kSetTransNameFn = Symbol.for('nextJsSetTransNameFn')

const noopFn = () => {}

module.exports = function (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod
  }
  if (!semver.satisfies(version, '>=11.1.0 <13.0.0')) {
    agent.logger.debug('next version %s not supported, skipping', version)
    return mod
  }

  const ins = agent._instrumentation
  const log = agent.logger

  const DevServer = mod.default
  shimmer.wrap(DevServer.prototype, 'generateRoutes', wrapGenerateRoutes)
  shimmer.wrap(DevServer.prototype, 'ensureApiPage', wrapEnsureApiPage)
  shimmer.wrap(DevServer.prototype, 'findPageComponents', wrapFindPageComponents)
  // XXX splain the 'NextNodeServer.renderErrorToResponse' base is used.
  // shimmer.wrap(DevServer.prototype, 'renderErrorToResponse', wrapRenderErrorToResponse)

  return mod

  function wrapGenerateRoutes (orig) {
    return function wrappedGenerateRoutes () {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments)
      }
      const routes = orig.apply(this, arguments)
      log.debug('wrap Next.js DevServer routes')
      routes.redirects.forEach(wrapRedirectRoute)
      routes.rewrites.beforeFiles.forEach(wrapRewriteRoute)
      routes.rewrites.afterFiles.forEach(wrapRewriteRoute)
      routes.rewrites.fallback.forEach(wrapRewriteRoute)
      routes.fsRoutes.forEach(wrapFsRoute)
      wrapCatchAllRoute(routes.catchAllRoute)
      return routes
    }
  }

  // XXX Link to Next.js route type.
  function wrapRedirectRoute (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    route.fn = function () {
      const trans = ins.currTransaction()
      if (trans) {
        trans.setDefaultName('Next.js ' + route.name)
        trans[kSetTransNameFn] = noopFn
      }
      return origRouteFn.apply(this, arguments)
    }
  }

  function wrapRewriteRoute (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    route.fn = function () {
      const trans = ins.currTransaction()
      if (trans) {
        trans.setDefaultName(`Next.js ${route.name} -> ${route.destination}`)
        trans[kSetTransNameFn] = noopFn
      }
      return origRouteFn.apply(this, arguments)
    }
  }

  // XXX splain
  function wrapFsRoute (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    // We explicitly handle only the `fsRoute`s that we know by name in the
    // Next.js code. We cannot set `trans.name` for all of them because of the
    // true catch-all-routes that match any path and only sometimes handled them
    // (e.g. 'public folder catchall').
    // XXX splain why we cannot do 'public folder catchall' and equiv.
    switch (route.name) {
      // XXX splain
      case '_next/data catchall':
        route.fn = function () {
          const trans = ins.currTransaction()
          if (trans) {
            trans.setDefaultName(`Next.js ${route.name}`)
            if (!trans[kSetTransNameFn]) {
              trans[kSetTransNameFn] = (_req, pathname) => {
                trans.setDefaultName(`Next.js _next/data route ${pathname}`)
              }
            }
          }
          return origRouteFn.apply(this, arguments)
        }
        break
      case '_next/static/development/_devMiddlewareManifest.json':
      case '_next/static/development/_devPagesManifest.json':
      case '_next/development catchall':
      case '_next/static catchall':
      case '_next/image catchall':
      case '_next catchall':
        route.fn = function () {
          const trans = ins.currTransaction()
          if (trans) {
            // XXX 'splain result.finished
            trans.setDefaultName(`Next.js ${route.name}`)
          }
          return origRouteFn.apply(this, arguments)
        }
        break
    }
  }

  function wrapCatchAllRoute (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    route.fn = function () {
      const trans = ins.currTransaction()
      if (trans && !trans[kSetTransNameFn]) {
        trans[kSetTransNameFn] = (req, pathname) => {
          trans.setDefaultName(`${req.method} ${pathname}`)
          // Ensure only the first `findPageComponents` result sets the trans
          // name, otherwise a loaded `/_error` for page error handling could
          // incorrectly override.
          trans[kSetTransNameFn] = noopFn
        }
      }
      return origRouteFn.apply(this, arguments)
    }
  }

  function wrapEnsureApiPage (orig) {
    return function wrappedEnsureApiPage (pathname) {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments)
      }
      const trans = ins.currTransaction()
      if (trans && trans.req) {
        // XXX slight limitation on "handled": It could *possibly* be false if
        //     exception in `getPagePath`. Trade-off between getting that
        //     wrong and setting the trans.name early enough for captureError
        //     usage.
        log.trace({ pathname }, 'set transaction name from ensureApiPage')
        trans.setDefaultName(`${trans.req.method} ${pathname}`)
        // In the DevServer an exception in an API handler will be followed up
        // with a rendering of "/_error".
        trans[kSetTransNameFn] = noopFn
      }
      return orig.apply(this, arguments)
    }
  }

  function wrapFindPageComponents (orig) {
    return function wrappedFindPageComponents ({ pathname }) {
      if (this.constructor !== DevServer) {
        return orig.apply(this, arguments)
      }
      const promise = orig.apply(this, arguments)
      promise.then(findComponentsResult => {
        if (findComponentsResult) {
          const trans = ins.currTransaction()
          // If Next.js is doing error handling for this request, then it is
          // loading an *error* page component (e.g. "_error.js"). We don't want
          // to use that component's path for the transaction name.
          console.log('XXX next-dev-server wrappedFindPageComponents: trans[kInErrorHandling]=%s', trans[kInErrorHandling], kInErrorHandling)
          if (trans && !trans[kInErrorHandling] && trans.req && trans[kSetTransNameFn]) {
            log.trace({ pathname }, 'set transaction name from findPageComponents')
            trans[kSetTransNameFn](trans.req, pathname)
          }
        }
      })
      return promise
    }
  }
}
