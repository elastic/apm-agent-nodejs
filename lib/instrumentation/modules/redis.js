'use strict'

var semver = require('semver')
var debug = require('debug')('elastic-apm')
var shimmer = require('../shimmer')

module.exports = function (redis, agent, version) {
  if (!semver.satisfies(version, '^2.0.0')) {
    debug('redis version %s not suppoted - aborting...', version)
    return redis
  }

  var proto = redis.RedisClient && redis.RedisClient.prototype
  if (semver.satisfies(version, '>2.5.3')) {
    debug('shimming redis.RedisClient.prototype.internal_send_command')
    shimmer.wrap(proto, 'internal_send_command', wrapInternalSendCommand)
  } else {
    debug('shimming redis.RedisClient.prototype.send_command')
    shimmer.wrap(proto, 'send_command', wrapSendCommand)
  }

  return redis

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      var span = agent.buildSpan()
      var id = span && span.transaction.id
      var command = commandObj && commandObj.command

      debug('intercepted call to RedisClient.prototype.internal_send_command %o', { id: id, command: command })

      if (span && commandObj) {
        var cb = commandObj.callback
        commandObj.callback = agent._instrumentation.bindFunction(function wrappedCallback () {
          span.end()
          if (cb) {
            return cb.apply(this, arguments)
          }
        })
        span.start(String(command).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var span = agent.buildSpan()
      var id = span && span.transaction.id
      var args = Array.prototype.slice.call(arguments)

      debug('intercepted call to RedisClient.prototype.internal_send_command %o', { id: id, command: command })

      if (span && args.length > 0) {
        var index = args.length - 1
        var cb = args[index]
        if (typeof cb === 'function') {
          args[index] = agent._instrumentation.bindFunction(function wrappedCallback () {
            span.end()
            return cb.apply(this, arguments)
          })
        } else if (Array.isArray(cb) && typeof cb[cb.length - 1] === 'function') {
          var cb2 = cb[cb.length - 1]
          cb[cb.length - 1] = agent._instrumentation.bindFunction(function wrappedCallback () {
            span.end()
            return cb2.apply(this, arguments)
          })
        } else {
          var obCb = agent._instrumentation.bindFunction(function wrappedCallback () {
            span.end()
          })
          if (typeof args[index] === 'undefined') {
            args[index] = obCb
          } else {
            args.push(obCb)
          }
        }
        span.start(String(command).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, args)
    }
  }
}
