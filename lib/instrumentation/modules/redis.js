'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (redis, opbeat, version) {
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
      var trace = opbeat.buildTrace()
      var uuid = trace && trace.transaction._uuid
      var command = commandObj && commandObj.command

      debug('intercepted call to RedisClient.prototype.internal_send_command %o', { uuid: uuid, command: command })

      if (trace && commandObj) {
        var cb = commandObj.callback
        commandObj.callback = opbeat._instrumentation.bindFunction(function wrappedCallback () {
          trace.end()
          if (cb) {
            return cb.apply(this, arguments)
          }
        })
        trace.start(String(command).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command) {
      var trace = opbeat.buildTrace()
      var uuid = trace && trace.transaction._uuid
      var args = Array.prototype.slice.call(arguments)

      debug('intercepted call to RedisClient.prototype.internal_send_command %o', { uuid: uuid, command: command })

      if (trace && args.length > 0) {
        var index = args.length - 1
        var cb = args[index]
        if (typeof cb === 'function') {
          args[index] = opbeat._instrumentation.bindFunction(function wrappedCallback () {
            trace.end()
            return cb.apply(this, arguments)
          })
        } else if (Array.isArray(cb) && typeof cb[cb.length - 1] === 'function') {
          var cb2 = cb[cb.length - 1]
          cb[cb.length - 1] = opbeat._instrumentation.bindFunction(function wrappedCallback () {
            trace.end()
            return cb2.apply(this, arguments)
          })
        } else {
          var obCb = opbeat._instrumentation.bindFunction(function wrappedCallback () {
            trace.end()
          })
          if (typeof args[index] === 'undefined') {
            args[index] = obCb
          } else {
            args.push(obCb)
          }
        }
        trace.start(String(command).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, args)
    }
  }
}
