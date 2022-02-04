'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

var spanSym = Symbol('elasticAPMSpan')

module.exports = function (ioredis, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>=2.0.0 <5.0.0')) {
    agent.logger.debug('ioredis version %s not supported - aborting...', version)
    return ioredis
  }

  agent.logger.debug('shimming ioredis.Command.prototype.initPromise')
  shimmer.wrap(ioredis.Command && ioredis.Command.prototype, 'initPromise', wrapInitPromise)

  if (!enabled) return ioredis

  agent.logger.debug('shimming ioredis.prototype.sendCommand')
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
          var span = command[spanSym]
          if (span && !span.ended) span.end()
          return cb.apply(this, arguments)
        })
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var span = agent.startSpan(null, 'cache', 'redis')
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to ioredis.prototype.sendCommand %o', { id: id, command: command && command.name })

      if (span && command) {
        // store span on command to it can be accessed by callback in initPromise
        command[spanSym] = span

        if (typeof command.resolve === 'function') {
          command.resolve = agent._instrumentation.bindFunction(command.resolve)
        }
        if (typeof command.reject === 'function') {
          command.reject = agent._instrumentation.bindFunction(command.reject)
        }
        if (command.promise) {
          const endSpan = function () {
            if (!span.ended) span.end()
          }
          if (typeof command.promise.then === 'function') {
            command.promise.then(endSpan).catch(endSpan)
          }
        }

        span.name = String(command.name).toUpperCase()
      }

      return original.apply(this, arguments)
    }
  }
}
