/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// See "lib/instrumentation/modules/next/README.md".

const semver = require('semver')

const shimmer = require('../../../../shimmer')

// XXX either share these symbols, or prefix them with ElasticAPM
const kInErrorHandling = Symbol.for('nextJsInErrorHandling')
const kSetTransNameFn = Symbol.for('nextJsSetTransNameFn')
const kCapturedTransErr = Symbol.for('nextJsCapturedTransErr')

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

  // This isn't perfect. Which framework the agent will report with a
  // custom Next.js server using another framework, e.g.
  //   https://github.com/vercel/next.js/blob/canary/examples/custom-server-fastify/server.js
  // depends on which is *imported* first.
  agent.setFramework({ name: 'Next.js', version, overwrite: false })

  const NextNodeServer = mod.default
  shimmer.wrap(NextNodeServer.prototype, 'generateRoutes', wrapGenerateRoutes)
  shimmer.wrap(NextNodeServer.prototype, 'ensureApiPage', wrapEnsureApiPage)
  shimmer.wrap(NextNodeServer.prototype, 'findPageComponents', wrapFindPageComponents)
  shimmer.wrap(NextNodeServer.prototype, 'renderErrorToResponse', wrapRenderErrorToResponse)

  return mod

  function wrapGenerateRoutes (orig) {
    return function wrappedGenerateRoutes () {
      if (this.constructor !== NextNodeServer) {
        return orig.apply(this, arguments)
      }
      const routes = orig.apply(this, arguments)
      log.debug('wrap Next.js NodeNextServer routes')
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
        // XXX 'splain
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
    // true catch-all-routes that match any path and only sometimes handle them
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
      if (this.constructor !== NextNodeServer) {
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
        trans[kSetTransNameFn] = noopFn
      }
      return orig.apply(this, arguments)
    }
  }

  function wrapFindPageComponents (orig) {
    return function wrappedFindPageComponents ({ pathname }) {
      if (this.constructor !== NextNodeServer) {
        return orig.apply(this, arguments)
      }
      const promise = orig.apply(this, arguments)
      promise.then(findComponentsResult => {
        if (findComponentsResult) {
          const trans = ins.currTransaction()
          // If Next.js is doing error handling for this request, then it is
          // loading an *error* page component (e.g. "_error.js"). We don't want
          // to use that component's path for the transaction name.
          if (trans && !trans[kInErrorHandling] && trans.req && trans[kSetTransNameFn]) {
            log.trace({ pathname }, 'set transaction name from findPageComponents')
            trans[kSetTransNameFn](trans.req, pathname)
          }
        }
      })
      return promise
    }
  }

  function wrapRenderErrorToResponse (orig) {
    return function wrappedRenderErrorToResponse (ctx, err) {
      // XXX 'splain
      // if (this.constructor !== NextNodeServer) {
      //   console.log('XXX wrappedRenderErrorToResponse -> ctor != NextNodeServer abort')
      //   return orig.apply(this, arguments)
      // }
      console.log('XXX wrappedRenderErrorToResponse(ctx, err=%s)', err && err.message)
      const trans = ins.currTransaction()
      if (trans) {
        // Signal to subsequent instrumentation for this transaction that
        // Next.js is now doing error handling for this request.
        // XXX could try setting `kSetTransNameFn` to noop instead. Then only need the one symbol.
        trans[kInErrorHandling] = true
        console.log('XXX next-server.js: set kInErrorHandling', kInErrorHandling)
      }
      // Next.js uses `err=null` to handle a 404.
      // XXX 'splain duplicate for apiResolver() handling in dev mode vs prod mode.
      console.log('XXX duplicate?', trans[kCapturedTransErr] === err)
      if (err && (!trans || trans[kCapturedTransErr] !== err)) {
        console.log('XXX capture error in wrappedRenderErrorToResponse')
        agent.captureError(err)
      }
      return orig.apply(this, arguments)
    }
  }
}
