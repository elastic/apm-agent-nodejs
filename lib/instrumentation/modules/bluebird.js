'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var wrap = require('../shimmer').wrap
var massWrap = require('../shimmer').massWrap

var BLUEBIRD_FNS = ['_then', '_addCallbacks']

module.exports = function (bluebird, opbeat, version) {
  var ins = opbeat._instrumentation

  if (!semver.satisfies(version, '>=2 <4')) {
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

  // WARNING: even if you remove these two shims, the tests might still pass
  // for bluebird@2. The tests are flaky and will only fail sometimes and in
  // some cases only if run together with the other tests.
  //
  // To test, run in a while-loop:
  //
  //   while :; do node test/instrumentation/modules/bluebird/bluebird.js || exit $?; done
  if (semver.satisfies(version, '<3')) {
    debug('shimming bluebird.each')
    wrap(bluebird, 'each', function wrapEach (original) {
      return function wrappedEach (promises, fn) {
        if (arguments.length !== 2) return original.apply(this, arguments)
        return original.call(this, promises, ins.bindFunction(fn))
      }
    })

    debug('shimming bluebird.prototype.each')
    wrap(bluebird.prototype, 'each', function wrapEach (original) {
      return function wrappedEach (fn) {
        if (arguments.length !== 1) return original.apply(this, arguments)
        return original.call(this, ins.bindFunction(fn))
      }
    })
  }

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
