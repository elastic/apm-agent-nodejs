'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

module.exports = function (redis, agent, { version, enabled }) {
  if (!semver.satisfies(version, '^2.0.0')) {
    agent.logger.debug('redis version %s not supported - aborting...', version)
    return redis
  }

  var proto = redis.RedisClient && redis.RedisClient.prototype
  if (semver.satisfies(version, '>2.5.3')) {
    agent.logger.debug('shimming redis.RedisClient.prototype.internal_send_command')
    shimmer.wrap(proto, 'internal_send_command', wrapInternalSendCommand)
  } else {
    agent.logger.debug('shimming redis.RedisClient.prototype.send_command')
    shimmer.wrap(proto, 'send_command', wrapSendCommand)
  }

  return redis

  function makeWrappedCallback (span, cb) {
    return agent._instrumentation.bindFunction(function wrappedCallback () {
      if (span) span.end()
      if (cb) {
        return cb.apply(this, arguments)
      }
    })
  }

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      var span = enabled && agent.startSpan(null, 'cache', 'redis')
      var id = span && span.transaction.id
      var command = commandObj && commandObj.command

      agent.logger.debug('intercepted call to RedisClient.prototype.internal_send_command %o', { id: id, command: command })

      if (commandObj) {
        commandObj.callback = makeWrappedCallback(span, commandObj.callback)
        if (span) span.name = String(command).toUpperCase()
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var span = enabled && agent.startSpan(null, 'cache', 'redis')
      var id = span && span.transaction.id
      var args = Array.prototype.slice.call(arguments)

      agent.logger.debug('intercepted call to RedisClient.prototype.internal_send_command %o', { id: id, command: command })

      if (args.length > 0) {
        var index = args.length - 1
        var cb = args[index]
        if (typeof cb === 'function') {
          args[index] = makeWrappedCallback(span, cb)
        } else if (Array.isArray(cb) && typeof cb[cb.length - 1] === 'function') {
          cb[cb.length - 1] = makeWrappedCallback(span, cb[cb.length - 1])
        } else {
          var obCb = makeWrappedCallback(span)
          if (typeof args[index] === 'undefined') {
            args[index] = obCb
          } else {
            args.push(obCb)
          }
        }
        if (span) span.name = String(command).toUpperCase()
      }

      return original.apply(this, args)
    }
  }
}
