'use strict'

var shimmer = require('shimmer')
var debug = require('debug')('opbeat')

module.exports = function (express, agent) {
  debug('shimming express.Router.use function')

  // The `use` function is called when Express app or Router sub-app is
  // initialized. This is the only place where we can get a hold of the
  // original path given when mounting a sub-app.
  shimmer.wrap(express.Router, 'use', function (orig) {
    return function (fn) {
      if (typeof fn === 'string' && Array.isArray(this.stack)) {
        var offset = this.stack.length
        var result = orig.apply(this, arguments)
        var layer
        for (; offset < this.stack.length; offset++) {
          layer = this.stack[offset]
          if (layer && layer.regexp && !layer.regexp.fast_slash) layer.__opbeat_mountpath = fn
        }
        return result
      } else {
        return orig.apply(this, arguments)
      }
    }
  })

  debug('shimming express.Router.process_params function')

  // When an incoming HTTP request is being processed and matched against the
  // layers in the app stack, the `process_params` function is called. Here we
  // have the oppotunity to extract the original route name that we stored when
  // shimming the `use` function above.
  shimmer.wrap(express.Router, 'process_params', function (orig) {
    return function (layer, called, req, res, done) {
      var path = req.route && (req.route.path || req.route.regexp && req.route.regexp.source) ||
        layer.__opbeat_mountpath ||
        ''

      req.__opbeat_route = (req.__opbeat_route || '') + path

      return orig.apply(this, arguments)
    }
  })

  debug('shimming express.static function')

  shimmer.wrap(express, 'static', function (orig) {
    return function () {
      var origServeStatic = orig.apply(this, arguments)
      return function serveStatic (req, res, next) {
        req._opbeat_static = true

        return origServeStatic(req, res, nextHook)

        function nextHook (err) {
          if (!err) req._opbeat_static = false
          return next.apply(this, arguments)
        }
      }
    }
  })

  return express
}
