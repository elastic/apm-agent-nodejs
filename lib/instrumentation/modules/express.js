'use strict'

var isError = require('core-util-is').isError
var semver = require('semver')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')

var mountStackLockedSym = Symbol('ElasticAPMExpressMountStackLocked')

module.exports = function (express, agent, version, enabled) {
  if (!enabled) return express
  if (!agent._conf.frameworkName) agent._conf.frameworkName = 'express'
  if (!agent._conf.frameworkVersion) agent._conf.frameworkVersion = version

  if (!semver.satisfies(version, '^4.0.0')) {
    agent.logger.debug('express version %s not supported - aborting...', version)
    return express
  }

  // express 5 moves the router methods onto a prototype
  var routerProto = semver.satisfies(version, '^5')
    ? (express.Router && express.Router.prototype)
    : express.Router

  var layerPatchedSymbol = Symbol('layer-patched')

  function shouldReport (err) {
    if (typeof err === 'string') return true
    if (isError(err) && !err[symbols.errorReportedSymbol]) {
      err[symbols.errorReportedSymbol] = true
      return true
    }
    return false
  }

  function patchLayer (layer) {
    if (!layer[layerPatchedSymbol]) {
      layer[layerPatchedSymbol] = true
      agent.logger.debug('shimming express.Router.Layer.handle function')
      shimmer.wrap(layer, 'handle', function (orig) {
        if (!agent._conf.captureExceptions || orig.length !== 4) return orig
        return function (err, req, res, next) {
          if (shouldReport(err)) {
            agent.captureError(err, { request: req })
          }
          return orig.apply(this, arguments)
        }
      })
    }
  }

  agent.logger.debug('shimming express.Router.process_params function')

  shimmer.wrap(routerProto, 'process_params', function (orig) {
    return function (layer, called, req, res, done) {
      patchLayer(layer)
      return orig.apply(this, arguments)
    }
  })

  agent.logger.debug('shimming express.Router.use function')

  // The `use` function is called when Express app or Router sub-app is
  // initialized. This is the only place where we can get a hold of the
  // original path given when mounting a sub-app.
  shimmer.wrap(routerProto, 'use', function (orig) {
    return function (fn) {
      if (typeof fn === 'string' && Array.isArray(this.stack)) {
        var offset = this.stack.length
        var result = orig.apply(this, arguments)
        var layer

        for (; offset < this.stack.length; offset++) {
          layer = this.stack[offset]

          if (layer && (fn !== '/' || (layer.regexp && !layer.regexp.fast_slash))) {
            agent.logger.debug('shimming layer.handle_request function (layer: %s)', layer.name)

            shimmer.wrap(layer, 'handle_request', function (orig) {
              return function (req, res, next) {
                if (req.route) {
                  // We use the signal of the route being set on the request
                  // object as indicating that the correct route have been
                  // found. When this happens we should no longer push and pop
                  // mount-paths on the stack
                  req[mountStackLockedSym] = true
                } else if (!req[mountStackLockedSym] && typeof next === 'function') {
                  if (!req[symbols.expressMountStack]) req[symbols.expressMountStack] = [fn]
                  else req[symbols.expressMountStack].push(fn)

                  arguments[2] = function () {
                    req[symbols.expressMountStack].pop()
                    return next.apply(this, arguments)
                  }
                }

                return orig.apply(this, arguments)
              }
            })
          } else {
            agent.logger.debug('skip shimming layer.handle_request (layer: %s, path: %s)', (layer && layer.name) || typeof layer, fn)
          }
        }

        return result
      } else {
        return orig.apply(this, arguments)
      }
    }
  })

  agent.logger.debug('shimming express.static function')

  shimmer.wrap(express, 'static', function wrapStatic (orig) {
    // By the time of this writing, Express adds a `mime` property to the
    // `static` function that needs to be copied to the wrapped function.
    // Instead of only copying the `mime` function, let's loop over all
    // properties in case new properties are added in later versions of
    // Express.
    Object.keys(orig).forEach(function (prop) {
      agent.logger.debug('copying property %s from express.static', prop)
      wrappedStatic[prop] = orig[prop]
    })

    return wrappedStatic

    function wrappedStatic () {
      var origServeStatic = orig.apply(this, arguments)
      return function serveStatic (req, res, next) {
        req[symbols.staticFile] = true

        return origServeStatic(req, res, nextHook)

        function nextHook (err) {
          if (!err) req[symbols.staticFile] = false
          return next.apply(this, arguments)
        }
      }
    }
  })

  return express
}
