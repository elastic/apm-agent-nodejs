/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// The main (but not only) module for instrumenting the Next.js server.
//
// Some notes on how the Next.js node server and the instrumentation works.
//
// - There are a number of ways to deploy (https://nextjs.org/docs/deployment)
//   a Next.js app. This instrumentation works with "Self-Hosting", and using
//   Next.js's built-in server (`class NextNodeServer`). This is the server
//   that is used for `next build && next start` and a subclass of that server
//   for `next dev`.
// - The Next.js server is a vanilla Node.js `http.createServer` using
//   `NextNodeServer.handleRequest` as the request handler, so every request
//   to the server is a call to that method.
// - Routes are defined by files under "pages/". An incoming request path is
//   resolved a built-in Next.js route handler or one of those pages -- loaded
//   by `NextNodeServer.findPageComponents`.
// - An error in rendering a page results in `renderErrorToResponse(err)` being
//   called to handle that error. (Limitation: There are some edge cases where
//   this method is not used to handle an exception. This instrumentation isn't
//   capturing those.)
// - *API* routes ("pages/api/...") are handled differently from other pages.
//   The `catchAllRoute` route handler calls `handleApiRequest`, which resolves
//   the URL path to a possibly dynamic route name (e.g. `/api/widgets/[id]`,
//   we instrument `ensureApiPage` to get that resolve route name), loads the
//   webpack-compiled user module for that route, and calls `apiResolver` in
//   "api-utils/node.ts" to execute. We instrument that `apiResolve()` function
//   to capture any errors in the user's handler.
// - There is open discussion here for other ways to support error capture
//   for Next.js: https://github.com/vercel/next.js/discussions/32230

const semver = require('semver')

const shimmer = require('../../../../shimmer')

const kInErrorHandling = Symbol('nextJsInErrorHandling')
// const kRouteName = Symbol('nextJsRouteName')
// const kPossibleApiRouteName = Symbol('nextJsPossibleApiRouteName')
const kSetTransNameFn = Symbol('nextJsSetTransNameFn')
const kRouteIsSet = Symbol('nextJsRouteIsSet')

module.exports = function (mod, agent, { version, enabled }) {
  console.log('XXX enabled: ', enabled)
  console.log('XXX version: ', version)
  if (!enabled) {
    return mod
  }
  if (!semver.satisfies(version, '>=11.1.0 <13.0.0')) {
    agent.logger.debug('next version %s not supported, skipping', version)
    return mod
  }

  const ins = agent._instrumentation
  const log = agent.logger

  const NextNodeServer = mod.default
  shimmer.wrap(NextNodeServer.prototype, 'generateRoutes', function (orig) {
    return function playWrappedProdServerGenerateRoutes () {
      // console.log('XXX playWrappedProdServerGenerateRoutes: start: is this my class? ', this.constructor === NextNodeServer)
      if (this.constructor === NextNodeServer) {
        console.log('  XXX do the prod server thing')
      }
      return orig.apply(this, arguments)
    }
  })
  // XXX might still use generateRoutes to wrap route.fn functions to capture
  //   the name of a route for the internal `_next`-y routes
  // shimmer.wrap(NextNodeServer.prototype, 'generateRoutes', wrapGenerateRoutes)
  // // shimmer.wrap(NextNodeServer.prototype, 'handleRequest', wrapHandleRequest)
  // // shimmer.wrap(NextNodeServer.prototype, 'handleApiRequest', wrapHandleApiRequest)
  // shimmer.wrap(NextNodeServer.prototype, 'ensureApiPage', wrapEnsureApiPage)
  // shimmer.wrap(NextNodeServer.prototype, 'findPageComponents', wrapFindPageComponents)
  // shimmer.wrap(NextNodeServer.prototype, 'renderErrorToResponse', wrapRenderErrorToResponse)

  return mod

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
        trans[kSetTransNameFn] = () => {} // XXX static noop func for perf?
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
        // trans[kRouteIsSet] = true // XXX splain
        trans[kSetTransNameFn] = () => {} // XXX static noop func for perf?
      }
      return origRouteFn.apply(this, arguments)
    }
  }

  function wrapCatchAllRoute (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    route.fn = function () {
      const trans = ins.currTransaction()
      // if (trans && !trans[kRouteIsSet]) {
      if (trans && !trans[kSetTransNameFn]) {
        trans[kSetTransNameFn] = (req, pathname) => { // XXX
          console.log('XXX kSetTransNameFn called for wrapCatchAllRoute: pathname=%s', pathname)
          trans.setDefaultName(`${req.method} ${pathname}`)
        }
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
    // XXX switch on route.name and allowlist the route.fn's we know
    switch (route.name) {
      case '_next/data catchall':
        route.fn = function () {
          const trans = ins.currTransaction()
          if (trans) {
            trans.setDefaultName(`Next.js ${route.name}`)
            if (!trans[kSetTransNameFn]) {
              trans[kSetTransNameFn] = (req, pathname) => {
                trans.setDefaultName(`Next.js data route ${req.method} ${pathname}`)
              }
            }
          }
          return origRouteFn.apply(this, arguments)
        }
        break
      // XXX more here
    }
  }
  function wrapFsRouteXXXold (route) {
    if (typeof route.fn !== 'function') {
      return
    }
    const origRouteFn = route.fn
    // XXX switch on route.name and allowlist the route.fn's we know
    if (route.name === '_next/data catchall') {
      route.fn = function () {
        const trans = ins.currTransaction()
        if (trans) {
          trans.setDefaultName(`Next.js ${route.name}`)
          if (!trans[kSetTransNameFn]) {
            trans[kSetTransNameFn] = (req, pathname) => { // XXX
              // QQQ HERE, next is "_next/data" and all fsRoutes
              console.log('XXX kSetTransNameFn called: pathname=%s', pathname)
              trans.setDefaultName(`Next.js data route ${req.method} ${pathname}`)
            }
          }
        }
        return origRouteFn.apply(this, arguments)
      }
    } else {
      route.fn = function () {
        const promise = origRouteFn.apply(this, arguments)
        const trans = ins.currTransaction()
        if (trans) {
          trans.setDefaultName(`Next.js ${route.name}`)
          // promise.then(result => {
          //   // The `result.finished` check is specifically for the
          //   // "public folder catchall" route. We don't want to set the
          //   // transaction name if there isn't a matching "public/..." path.
          //   if (result && result.finished) {
          //     // XXX HERE why doesn't this work:
          //     //      curl -i localhost:3000/favicon.ico
          //     // getting "GET unknown route"
          //     console.log('XXX setting trans.name from route: %s', route.name, result)
          //     trans.setDefaultName(`Next.js ${route.name}`)
          //   }
          // })
        }
        return promise
      }
    }
  }

  function wrapGenerateRoutes (orig) {
    return function wrappedGenerateRoutes () {
      const routes = orig.apply(this, arguments)
      console.log('XXX wrappedGenerateRoutes')
      // console.log('XXX routes: ', routes)
      routes.redirects.forEach(wrapRedirectRoute)
      routes.rewrites.beforeFiles.forEach(wrapRewriteRoute)
      routes.rewrites.afterFiles.forEach(wrapRewriteRoute)
      routes.rewrites.fallback.forEach(wrapRewriteRoute)
      routes.fsRoutes.forEach(wrapFsRoute)
      wrapCatchAllRoute(routes.catchAllRoute)
      return routes
    }
  }

  // function wrapHandleRequest (orig) {
  //   return function wrappedHandleRequest (req, _res, parsedUrl) {
  //     console.log('\nXXX wrappedHandleRequest(req "%s %s", res, parsedUrl=%s)', req.method, req.url, parsedUrl)
  //     const promise = orig.apply(this, arguments)
  //     promise.then(
  //       () => {
  //         const trans = ins.currTransaction()
  //         if (trans && trans[kRouteName]) {
  //           trans.setDefaultName(`${req.method} ${trans[kRouteName]}`)
  //           console.log('XXX setDefaultName: ', trans.name)
  //         }
  //       }
  //     )
  //     return promise
  //   }
  // }

  // function wrapHandleApiRequest (orig) {
  //   return function wrappedHandleApiRequest () {
  //     const promise = orig.apply(this, arguments)
  //     promise.then(
  //       handled => {
  //         if (handled) {
  //           console.log('XXX handled: ', handled)
  //           // The API request was handled, therefore the route name found
  //           // in the wrapped `ensureApiPage` is the route name.
  //           const trans = ins.currTransaction()
  //           if (trans && trans[kPossibleApiRouteName]) {
  //             console.log('XXX could set trans name here')
  //             trans[kRouteName] = trans[kPossibleApiRouteName]
  //           }
  //         }
  //       }
  //     )
  //     return promise
  //   }
  // }
  function wrapEnsureApiPage (orig) {
    return function wrappedEnsureApiPage (pathname) {
      const trans = ins.currTransaction()
      if (trans && trans.req) {
        // XXX slight limitation on "handled": It could *possibly* be false if
        //     exception in `getPagePath`. Trade-off between getting that
        //     wrong and setting the trans.name early enough for captureError
        //     usage.
        log.trace({ pathname }, 'set transaction name from ensureApiPage')
        trans.setDefaultName(`${trans.req.method} ${pathname}`)
      }
      return orig.apply(this, arguments)
    }
  }

  function wrapFindPageComponents (orig) {
    return function wrappedFindPageComponents ({ pathname }) {
      const promise = orig.apply(this, arguments)
      promise.then(findComponentsResult => {
        if (findComponentsResult) {
          const trans = ins.currTransaction()
          // If Next.js is doing error handling for this request, then it is
          // loading an *error* page component (e.g. "_error.js"). We don't want
          // to use that component's path for the transaction name.
          if (trans && !trans[kInErrorHandling] && trans.req && trans[kSetTransNameFn]) {
            log.trace({ pathname }, 'set transaction name from findPageComponents')
            // XXX
            // trans.setDefaultName(`${trans.req.method} ${pathname}`)
            trans[kSetTransNameFn](trans.req, pathname)
          }
        }
      })
      return promise
    }
  }

  function wrapRenderErrorToResponse (orig) {
    return function wrappedRenderErrorToResponse (ctx, err) {
      console.log('XXX wrappedRenderErrorToResponse(ctx, err=%s)', err && err.message)
      const trans = ins.currTransaction()
      if (trans) {
        // Signal to subsequent instrumentation for this transaction that
        // Next.js is now doing error handling for this request.
        // XXX could try setting `kSetTransNameFn` to noop instead. Then only need the one symbol.
        trans[kInErrorHandling] = true
      }
      // Next.js uses `err=null` to handle a 404.
      if (err) {
        agent.captureError(err)
      }
      return orig.apply(this, arguments)
    }
  }
}
