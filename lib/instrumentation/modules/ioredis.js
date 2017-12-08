'use strict'

var semver = require('semver')
var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')

module.exports = function (ioredis, agent, version) {
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
  // the same tick as the call to command.callback, we'll lose the last span
  // as it hasn't yet ended.
  function wrapInitPromise (original) {
    return function wrappedInitPromise () {
      var command = this
      var cb = this.callback

      if (typeof cb === 'function') {
        this.callback = agent._instrumentation.bindFunction(function wrappedCallback () {
          var span = command.__obSpan
          if (span && !span.ended) span.end()
          return cb.apply(this, arguments)
        })
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var span = agent.buildSpan()
      var id = span && span.transaction.id

      debug('intercepted call to ioredis.prototype.sendCommand %o', { id: id, command: command && command.name })

      if (span && command) {
        // store span on command to it can be accessed by callback in initPromise
        command.__obSpan = span

        if (typeof command.resolve === 'function') {
          command.resolve = agent._instrumentation.bindFunction(command.resolve)
        }
        if (typeof command.reject === 'function') {
          command.reject = agent._instrumentation.bindFunction(command.reject)
        }
        if (command.promise && typeof command.promise.finally === 'function') {
          command.promise.finally(function () {
            if (!span.ended) span.end()
          })
        }

        span.start(String(command.name).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, arguments)
    }
  }
}
