/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// The main (but not only) module for instrumenting the Next.js server.
//
// XXX server hierarchy, mainly about the "prod" server, but mostly should
//    work for the dev server `npm run dev`.
//
// Some notes on how the instrumentation works.
//
// - XXX NextNodeServer.handleRequest
// - *API* routes ("pages/api/...") in a Next.js app are handled differently
//   from other pages. The `catchAllRoute` calls `handleApiRequest`, which
//   resolves the URL path to a possibly dynamic route name (e.g.
//   `/api/widgets/[id]`, we instrument `ensureApiPage` to get that resolve
//   route name), loads the webpack-compiled user module for that route, and
//   calls `apiResolver` in "api-utils/node.ts" to execute. We instrument that
//   `apiResolve()` function to capture any errors in the user's handler.
// - For other routes ("pages/..."), XXX
//
// - There is open discussion here for other ways to support error capture
//   for Next.js: https://github.com/vercel/next.js/discussions/32230

const semver = require('semver')

const shimmer = require('../../../../shimmer')

const kRouteName = Symbol('nextJsRouteName')
const kPossibleApiRouteName = Symbol('nextJsPossibleApiRouteName')

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
  shimmer.wrap(NextNodeServer.prototype, 'generateRoutes', wrapGenerateRoutes)
  shimmer.wrap(NextNodeServer.prototype, 'handleRequest', wrapHandleRequest)
  shimmer.wrap(NextNodeServer.prototype, 'handleApiRequest', wrapHandleApiRequest)
  shimmer.wrap(NextNodeServer.prototype, 'ensureApiPage', wrapEnsureApiPage)
  shimmer.wrap(NextNodeServer.prototype, 'findPageComponents', wrapFindPageComponents)
  shimmer.wrap(NextNodeServer.prototype, 'renderErrorToResponse', wrapRenderErrorToResponse)

  /*
  XXX
  - might still use generateRoutes to wrap route.fn functions to capture
    the name of a route for the internal `_next`-y routes

  */

  return mod

  function wrapGenerateRoutes (orig) {
    return function wrappedGenerateRoutes () {
      const routes = orig.apply(this, arguments)
      // console.log('XXX routes: ', routes)
      return routes
    }
  }

  function wrapHandleRequest (orig) {
    return function wrappedHandleRequest (req, _res, parsedUrl) {
      console.log('\nXXX wrappedHandleRequest(req "%s %s", res, parsedUrl=%s)', req.method, req.url, parsedUrl)
      const promise = orig.apply(this, arguments)
      promise.then(
        () => {
          const trans = ins.currTransaction()
          if (trans && trans[kRouteName]) {
            trans.setDefaultName(`${req.method} ${trans[kRouteName]}`)
          }
        }
      )
      return promise
    }
  }

  function wrapHandleApiRequest (orig) {
    return function wrappedHandleApiRequest () {
      const promise = orig.apply(this, arguments)
      promise.then(
        handled => {
          if (handled) {
            // The API request was handled, therefore the route name found
            // in the wrapped `ensureApiPage` is the route name.
            const trans = ins.currTransaction()
            if (trans && trans[kPossibleApiRouteName]) {
              trans[kRouteName] = trans[kPossibleApiRouteName]
            }
          }
        }
      )
      return promise
    }
  }
  function wrapEnsureApiPage (orig) {
    return function wrappedEnsureApiPage (pathname) {
      const trans = ins.currTransaction()
      if (trans) {
        log.trace({ pathname }, 'found possible API route name from ensureApiPage')
        trans[kPossibleApiRouteName] = pathname
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
          // Avoid overriding and already set kRouteName for the case when
          // there is a page error and `findPageComponents()` is called
          // independently to load the error page (e.g. "_error.js" or "500.js").
          if (trans && !trans[kRouteName]) {
            log.trace({ pathname }, 'found route from findPageComponents')
            trans[kRouteName] = pathname
          }
        }
      })
      return promise
    }
  }
  function wrapRenderErrorToResponse (orig) {
    return function wrappedRenderErrorToResponse (ctx, err) {
      console.log('XXX wrappedRenderErrorToResponse(ctx, err=%s)', err)
      agent.captureError(err)
      return orig.apply(this, arguments)
    }
  }
}
