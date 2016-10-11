'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var wrap = require('../shimmer').wrap
var massWrap = require('../shimmer').massWrap

var BLUEBIRD_FNS = ['_then', '_addCallbacks']

module.exports = function (bluebird, opbeat, version) {
  var ins = opbeat._instrumentation

  if (!semver.satisfies(version, '^3.0.0')) {
    debug('bluebird version %s not suppoted - aborting...', version)
    return bluebird
  }

  debug('shimming bluebird.prototype functions:', BLUEBIRD_FNS)
  massWrap(bluebird.prototype, BLUEBIRD_FNS, wrapThen)

  // Calling bluebird.config might overwrite the
  // bluebird.prototype._attachCancellationCallback function with a new
  // function. We need to hook into this new function
  debug('shimming bluebird.config')
  wrap(bluebird, 'config', function wrapConfig (original) {
    return function wrappedConfig () {
      var result = original.apply(this, arguments)

      debug('shimming bluebird.prototype._attachCancellationCallback')
      wrap(bluebird.prototype, '_attachCancellationCallback', function wrapAttachCancellationCallback (original) {
        return function wrappedAttachCancellationCallback (onCancel) {
          if (arguments.length !== 1) return original.apply(this, arguments)
          return original.call(this, ins.bindFunction(onCancel))
        }
      })

      return result
    }
  })

  return bluebird

  function wrapThen (original) {
    return function wrappedThen () {
      var args = Array.prototype.slice.call(arguments)
      if (typeof args[0] === 'function') args[0] = ins.bindFunction(args[0])
      if (typeof args[1] === 'function') args[1] = ins.bindFunction(args[1])
      return original.apply(this, args)
    }
  }
}
