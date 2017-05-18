'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (ioredis, opbeat, version) {
  if (!semver.satisfies(version, '^2.0.0 || ^3.0.0')) {
    debug('ioredis version %s not suppoted - aborting...', version)
    return ioredis
  }

  debug('shimming ioredis.Command.prototype.initPromise')
  shimmer.wrap(ioredis.Command && ioredis.Command.prototype, 'initPromise', wrapInitPromise)

  debug('shimming ioredis.prototype.sendCommand')
  shimmer.wrap(ioredis.prototype, 'sendCommand', wrapSendCommand)

  return ioredis

  // wrap initPromise to allow us to get notified when the callback to a
  // command is called. If we don't do this we will still get notified because
  // we register a callback with command.promise.finally the
  // wrappedSendCommand, but the finally call will not get fired until the tick
  // after the command.callback have fired, so if the transaction is ended in
  // the same tick as the call to command.callback, we'll lose the last trace
  // as it hasn't yet ended.
  function wrapInitPromise (original) {
    return function wrappedInitPromise () {
      var command = this
      var cb = this.callback

      if (typeof cb === 'function') {
        this.callback = opbeat._instrumentation.bindFunction(function wrappedCallback () {
          var trace = command.__obTrace
          if (trace && !trace.ended) trace.end()
          return cb.apply(this, arguments)
        })
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var trace = opbeat.buildTrace()
      var uuid = trace && trace.transaction._uuid

      debug('intercepted call to ioredis.prototype.sendCommand %o', { uuid: uuid, command: command && command.name })

      if (trace && command) {
        // store trace on command to it can be accessed by callback in initPromise
        command.__obTrace = trace

        if (typeof command.resolve === 'function') {
          command.resolve = opbeat._instrumentation.bindFunction(command.resolve)
        }
        if (typeof command.reject === 'function') {
          command.reject = opbeat._instrumentation.bindFunction(command.reject)
        }
        if (command.promise && typeof command.promise.finally === 'function') {
          command.promise.finally(function () {
            if (!trace.ended) trace.end()
          })
        }

        trace.start(String(command.name).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, arguments)
    }
  }
}
