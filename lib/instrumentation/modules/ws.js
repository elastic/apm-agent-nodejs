'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (ws, agent, version) {
  if (!semver.satisfies(version, '^1.0.0 || ^2.0.0 || ^3.0.0')) {
    debug('ws version %s not suppoted - aborting...', version)
    return ws
  }

  debug('shimming ws.prototype.send function')
  shimmer.wrap(ws.prototype, 'send', wrapSend)

  return ws

  function wrapSend (orig) {
    return function wrappedSend () {
      var trace = agent.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to ws.prototype.send %o', { uuid: uuid })

      if (!trace) return orig.apply(this, arguments)

      var args = [].slice.call(arguments)
      var cb = args[args.length - 1]
      if (typeof cb === 'function') {
        args[args.length - 1] = done
      } else {
        cb = null
        args.push(done)
      }

      trace.start('Send WebSocket Message', 'websocket.send')

      return orig.apply(this, args)

      function done () {
        trace.end()
        if (cb) cb.apply(this, arguments)
      }
    }
  }
}
