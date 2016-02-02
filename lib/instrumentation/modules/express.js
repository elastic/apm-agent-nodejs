'use strict'

var shimmer = require('shimmer')
var debug = require('debug')('opbeat')

module.exports = function (express, agent) {
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
