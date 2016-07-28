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
  debug('shimming redis.RedisClient.prototype.internal_send_command')
  shimmer.wrap(proto, 'internal_send_command', wrapInternalSendCommand)

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
          return cb.apply(this, arguments)
        })
        trace.start(String(command).toUpperCase(), 'cache.redis')
      }

      return original.apply(this, arguments)
    }
  }
}
