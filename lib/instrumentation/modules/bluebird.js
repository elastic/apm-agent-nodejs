'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
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

  if (bluebird.prototype && bluebird.prototype._attachCancellationCallback) {
    debug('shimming bluebird.prototype._attachCancellationCallback')
    var _attachCancellationCallback = bluebird.prototype._attachCancellationCallback.bind(bluebird.prototype)
    Object.defineProperty(bluebird.prototype, '_attachCancellationCallback', {
      get: function () {
        return _attachCancellationCallback
      },
      set: function (fn) {
        _attachCancellationCallback = function wrappedAttachCancellationCalback (onCancel) {
          if (arguments.length !== 1) return fn.apply(this, arguments)
          return fn.call(this, ins.bindFunction(onCancel))
        }
      }
    })
  } else {
    debug('WARNING: could not shim bluebird.prototype._attachCancellationCallback')
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
