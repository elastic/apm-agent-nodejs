'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')
var { getDBDestination } = require('../context')

const isWrappedRedisCbSym = Symbol('ElasticAPMIsWrappedRedisCb')

module.exports = function (redis, agent, { version, enabled }) {
  if (!semver.satisfies(version, '>=2.0.0 <4.0.0')) {
    agent.logger.debug('redis version %s not supported - aborting...', version)
    return redis
  }

  // The undocumented field on a RedisClient instance on which connection
  // options are stored has changed a few times.
  //
  // - >=2.4.0: `client.connection_options.{host,port}`, commit eae5596a
  // - >=2.3.0, <2.4.0: `client.connection_option.{host,port}`, commit d454e402
  // - >=0.12.0, <2.3.0: `client.connectionOption.{host,port}`, commit 064260d1
  // - <0.12.0: *maybe* `client.{host,port}`
  const connOptsFromRedisClient = (rc) => rc.connection_options ||
    rc.connection_option || rc.connectionOption || {}

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
    const wrappedCallback = agent._instrumentation.bindFunction(function () {
      if (span) span.end()
      if (cb) {
        return cb.apply(this, arguments)
      }
    })
    wrappedCallback[isWrappedRedisCbSym] = true
    return wrappedCallback
  }

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      if (!commandObj || typeof commandObj.command !== 'string') {
        // Unexpected usage. Skip instrumenting this call.
        return original.apply(this, arguments)
      }

      if (commandObj.callback && commandObj.callback[isWrappedRedisCbSym]) {
        // Avoid re-wrapping send_command called *again* for commands queued
        // before the client was "ready".
        return original.apply(this, arguments)
      }

      const command = commandObj.command
      agent.logger.debug({ command: command }, 'intercepted call to RedisClient.prototype.internal_send_command')
      const spanName = command.toUpperCase()
      var span = enabled && agent.startSpan(spanName, 'cache', 'redis')
      if (span) {
        const connOpts = connOptsFromRedisClient(this)
        span.setDestinationContext(getDBDestination(span, connOpts.host, connOpts.port))
        commandObj.callback = makeWrappedCallback(span, commandObj.callback)
      }

      return original.apply(this, arguments)
    }
  }

  function wrapSendCommand (original) {
    return function wrappedSendCommand (command, args, cb) {
      if (typeof command !== 'string') {
        // Unexpected usage. Skip instrumenting this call.
        return original.apply(this, arguments)
      }

      let origCb = cb
      if (!origCb && Array.isArray(args) && typeof args[args.length - 1] === 'function') {
        origCb = args[args.length - 1]
      }
      if (origCb && origCb[isWrappedRedisCbSym]) {
        // Avoid re-wrapping send_command called *again* for commands queued
        // before the client was "ready".
        return original.apply(this, arguments)
      }

      var span = enabled && agent.startSpan(null, 'cache', 'redis')
      var id = span && span.transaction.id

      agent.logger.debug('intercepted call to RedisClient.prototype.send_command %o', { id: id, command: command })

      if (span) {
        let host, port
        const connOpts = connOptsFromRedisClient(this)
        if (connOpts) {
          host = connOpts.host
          port = connOpts.port
        }
        span.setDestinationContext(getDBDestination(span, host, port))
        span.name = String(command).toUpperCase()

        const wrappedCb = makeWrappedCallback(span, origCb)
        if (cb) {
          cb = wrappedCb
        } else if (origCb) {
          args[args.length - 1] = wrappedCb
        } else {
          cb = wrappedCb
        }
      }

      return original.call(this, command, args, cb)
    }
  }
}
