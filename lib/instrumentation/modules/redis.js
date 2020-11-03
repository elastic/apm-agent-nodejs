'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')
var { getDBDestination } = require('../context')

module.exports = function (redis, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>=2.0.0 <4.0.0')) {
    agent.logger.debug('redis version %s not supported - aborting...', version)
    return redis
  }

  // The undocumented field on a RedisClient instance on which connection
  // options are stored has changed a few times.
  let connOptsFromRedisClient
  if (semver.gte(version, '2.4.0')) {
    connOptsFromRedisClient = (rc) => rc.connection_options
  } else if (semver.gte(version, '2.3.0')) {
    connOptsFromRedisClient = (rc) => rc.connection_option
  } else if (semver.gte(version, '0.12.0')) {
    connOptsFromRedisClient = (rc) => rc.connectionOption
  } else {
    // *Maybe* available on `client.{host|port}`, but not verified.
    connOptsFromRedisClient = () => {}
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

      if (span) {
        let host, port
        let connOpts = connOptsFromRedisClient(this)
        if (connOpts) {
          host = connOpts.host
          port = connOpts.port
        }
        span.setDestinationContext(getDBDestination(span, host, port))
      }
      if (commandObj) {
        commandObj.callback = makeWrappedCallback(span, commandObj.callback)
        if (span) {
          span.name = String(command).toUpperCase()
        }
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

      if (span) {
        let host, port
        let connOpts = connOptsFromRedisClient(this)
        if (connOpts) {
          host = connOpts.host
          port = connOpts.port
        }
        span.setDestinationContext(getDBDestination(span, host, port))
      }
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
        if (span) {
          span.name = String(command).toUpperCase()
        }
      }

      return original.apply(this, args)
    }
  }
}
